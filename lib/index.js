"use strict";

const ModbusRTU = require('modbus-serial');
const bufferpack = require('bufferpack');

const Modbus = function () { };

Modbus.prototype.init = async function (app) {
  this.app = app;
  this.logger = app.logger;
  this.config = app.modbus.config;
  app.modbus.ready = true;
};


async function readInput (client, input, delay = 0) {
  await new Promise(resolve => setTimeout(resolve, delay));
  client.setID(input.id);
  return new Promise((resolve, reject) => {
      client[input.fc](input.add, input.num, (err, data) => {
          if (err) {
              reject(err);
          } else {
              resolve(data);
          }
      });
  });
}

Modbus.prototype.read = async function (app) {
  
  if (!app.modbus.ready) return;
  
  app.modbus.reading = true;
  app.modbus.ready = false;
  app.modbus.errors = false;
  
  const modbus_vars = [];
  // each 'bus config'
  const reqs = this.config.map(async conf => {
    let client;
    try {
        client = new ModbusRTU();
        client.setTimeout(conf.bus.timeout);
        await client.connectRTUBuffered(conf.bus.serial_port, { baudRate: conf.bus.baudrate });
    } catch (error) {
      console.log(error);
        app.logger.error(`modbus error: ${error.message}`);
    }
    if (client.isOpen) {
        for (const input of conf.inputs) {
            try {
                const data = await readInput(client, input, conf.bus.read_delay);
                if (data) {
                    const unpacked = bufferpack.unpack(input.format, data.buffer, 0);
                    // console.log("data", data.data);
                    Object.keys(unpacked).forEach( (key) => {
                        if (input.parser[key].label.includes('_none_')) return;
                        const modbus_var = {};
                        // setup the value using the configured scale
                        modbus_var['value'] = this.round(
                          unpacked[key] * input.parser[key].scale, 2);
                        // setup the var label
                        modbus_var['label'] = input.parser[key].label;
                        // setup the unit
                        modbus_var['unit'] = input.parser[key].unit;
                        // setup the error
                        modbus_var['error'] = false;
                        // push this var to the modbus_vars list
                        modbus_vars.push(modbus_var);
                    });
                }
            } catch (error) {
                app.logger.debug(`modbus error: ${conf.bus.serial_port} ${input.id} ${input.add} ${input.num} ${error.message}`);
                Object.keys(input.parser).forEach(key => {
                    if (input.parser[key].label.includes('none')) return;
                    const modbus_var = {};
                    // setup the var label
                    modbus_var['label'] = input.parser[key].label;
                    // setup the unit
                    modbus_var['unit'] = input.parser[key].unit;
                    // setup the error
                    modbus_var['error'] = error.message;
                    // push this var to the modbus_vars list
                    modbus_vars.push(modbus_var);
                });
            }
        }
        await client.close();
    }
  });

  // wait for all promises
  await Promise.all(reqs);

  // flag reading
  app.modbus.reading = false;
  app.modbus.ready = true;
  
  // log result
  // console.log('modbus_vars', modbus_vars);
  // return the vars
  return modbus_vars;
};

Modbus.prototype.getOutConf = function (outLabel) {
  let conf, output, parser;
  conf = this.config.find((b) => {
    return b.outputs ? b.outputs.find((o) => {
      let found = false;
      Object.keys(o.parser).forEach((p) => {
        if (o.parser[p].label === outLabel) {
          parser = o.parser[p];
          output = o;
          found = true;
        }
      });
      if (found) return b;
    }) : null;
  });
  return [conf, output, parser];
};


Modbus.prototype.write = async function (outLabel, data) {
  if (!this.app.modbus.ready) return;
  this.app.modbus.ready = false;

  // the output
  let conf, output, parser, packed, unpacked, arrayFormat = ">", res;
  // get config
  [conf, output, parser] = this.getOutConf(outLabel);

  if (!conf) {
    this.logger.error(`modbus.write no config found for "${outLabel}"`);
    return;
  }

  if (!Array.isArray(data)) {
    throw new Error(`modbus.write: data must be an array `);
  }

  try {
    packed = bufferpack.pack(output.format, data);
  } catch (e) {
    throw e;
  }

  let packedArray;
  if (output.fc === 'writeFC15') {
    arrayFormat += "B"
    packedArray = data;
  } else {
    arrayFormat += "H".repeat(packed.length / 2);
    packedArray = bufferpack.unpack(arrayFormat, packed);
  }

  // log what we want to write
  this.logger.debug(`modbus.write ${conf.bus.name} id ${output.id} add ${output.add} ${output.fc} [${packedArray}]`);

  //
  // writeRegister/writeRegisters functions
  //
  if (output.fc === "writeRegister" || output.fc === "writeRegisters") {
    try {
      // set id
      this.buses[conf.bus.name].client.setID(output.id);
      // try to write
      res = await new Promise( (resolve, reject) => {
        this.buses[conf.bus.name].client[output.fc](
          output.add, packedArray,
          async (error, data) => {
            // reject error
            if (error) {
              resolve(error);
            }
            resolve(data);
          });
        });
    } catch (e) {
      this.logger.error(`modbus.write: ${e.message}`);
      res = e;
    }
  } else {
    //
    // other functions
    //
    try {
      // try to write
      res = await new Promise( (resolve, reject) => {
        this.buses[conf.bus.name].client[output.fc](
          output.id, output.add, packedArray,
          async (error, data) => {
            // reject error
            if (error) {
              resolve(error);
            }
            resolve(data);
          });
        });
    } catch (e) {
      this.logger.error(`modbus.write: ${e.message}`);
      res = e;
    }
  }

  // write delay
  await this.delay(conf.bus.write_delay);

  this.app.modbus.ready = true;

  return res;
};


Modbus.prototype.round = function (value, precision) {
  var multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
};


Modbus.prototype.delay = async function (delay) {
  await new Promise((resolve, reject) => {
    setTimeout( () => {
      resolve();
    }, delay);
  });
};

module.exports = Modbus;
