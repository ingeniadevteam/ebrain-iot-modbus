"use strict";

const ModbusRTU = require('modbus-serial');
const bufferpack = require('bufferpack');

const Modbus = function () { };

Modbus.prototype.init = async function (app) {
  // get the app
  this.app = app;
  // get the logger
  this.logger = app.logger;
  // get the config
  this.config = app.modbus.config;
  // module handlers
  this.buses = {};
  // setup a serial port handler for every configured bus
  const reqs = this.config.map( async (conf) => {
    if (!conf.bus.enabled) {
      return;
    }
    // the handler ...
    const client = await new ModbusRTU();
    // setup the client into this.buses property
    this.buses[conf.bus.name] = {};
    this.buses[conf.bus.name]["client"] = client;
    // UDP
    if (conf.bus.type === 'UDP') {
      try {
        const port = process.env.NODE_ENV === 'development' ? conf.bus.dev_serial_port : conf.bus.serial_port
        if (!port) return;
        // open connection to a serial port
        await client.connectRTUBuffered(port, {
          parity: conf.bus.parity,
          baudRate: conf.bus.baudrate
        }, null);
        // set te timeout
        client.setTimeout(conf.bus.timeout);
        // we have client
        this.logger.info(`Modbus ${conf.bus.name} connected to ${port}@${conf.bus.baudrate}`);
      } catch (e) {
        this.logger.info(`modbus ${conf.bus.name} connection error`);
      }
    // TCP
    } else if (conf.bus.type === 'TCP') {
      // dev server?
      if (conf.bus.development_server) {
        // setup a ModbusTCP Server
        await require('./dev/server.js')(
          app,
          conf.bus.host,
          conf.bus.port
        );
      }
      try {
        if (process.env.NODE_ENV === 'development') return;
        // open connection to a tcp line
        await client.connectTCP(conf.bus.host, {
          port: conf.bus.port
        }, null);
        // we have client
        this.logger.info(`modbus ${conf.bus.name} connected to modbus://${conf.bus.host}:${conf.bus.port}`);
      } catch (e) {
        this.logger.info(`modbus ${conf.bus.name} connection error`);
      }
    }
  });

  // http://stackabuse.com/node-js-async-await-in-es7/
  await Promise.all(reqs);
  // enable modbus
  app.modbus.ready = true;
};


Modbus.prototype.read = async function (app) {
  
  if (!app.modbus.ready) return;
  
  app.modbus.reading = true;
  app.modbus.ready = false;
  app.modbus.errors = false;
  
  const modbus_vars = [];
  // each 'bus config'
  const reqs = this.config.map( async (conf) => {
    // each 'bus config'
    // need to use for loop to request same resource (aka. same serial port)
    // console.log('bus', conf.bus.name);
    await new Promise( async resolve => {
      for (let i in conf.inputs) {
        // console.log('format', conf.inputs[i].format);
        // read
        try {
          await new Promise( (resolve, reject) => {
            // this.logger.debug(`modbus reading ${conf.bus.name} ${conf.inputs[i].fc} ${conf.inputs[i].id} ${conf.inputs[i].add} ${conf.inputs[i].num}`); // XXX
            // resolve();

            this.buses[conf.bus.name].client[conf.inputs[i].fc](
              conf.inputs[i].id, conf.inputs[i].add, conf.inputs[i].num, (error, data) => {
              // reject error
              if (error) {
                this.logger.debug(`modbus error: ${error.message} ${conf.inputs[i].id} ${conf.inputs[i].add} ${conf.inputs[i].num}`); // XXX
                Object.keys(conf.inputs[i].parser).forEach(key => {
                  if (conf.inputs[i].parser[key].label.includes('_none_')) return;
                  const modbus_var = {};
                  // setup the var label
                  modbus_var['label'] = conf.inputs[i].parser[key].label;
                  // setup the unit
                  modbus_var['unit'] = conf.inputs[i].parser[key].unit;
                  // setup the error
                  modbus_var['error'] = error.message;
                  // push this var to the modbus_vars list
                  modbus_vars.push(modbus_var);
                });
                reject(error);
              } else {
                // ok, we have a buffer in data.buffer
                // let's try to unpack it using the configured format
                try {
                  const unpacked = bufferpack.unpack(conf.inputs[i].format, data.buffer, 0);
                  // now create an modbus_var Object using the configured parser
                  Object.keys(unpacked).forEach( (key) => {
                    if (conf.inputs[i].parser[key].label.includes('_none_')) return;
                    const modbus_var = {};
                    // setup the value using the configured scale
                    modbus_var['value'] = this.round(
                      unpacked[key] * conf.inputs[i].parser[key].scale, 2);
                    // setup the var label
                    modbus_var['label'] = conf.inputs[i].parser[key].label;
                    // setup the unit
                    modbus_var['unit'] = conf.inputs[i].parser[key].unit;
                    // setup the error
                    modbus_var['error'] = false;
                    // push this var to the modbus_vars list
                    modbus_vars.push(modbus_var);
                  });
                  resolve();
                } catch (error) {
                  this.logger.error(`can not unpack", ${conf.inputs[i].id} ${conf.inputs[i].add} ${conf.inputs[i].num} ${data.buffer}`);
                  reject(error);
                }
              }
            });

          });
        } catch (e) {
          this.logger.debug(`modbus.read id ${conf.inputs[i].id}, add ${conf.inputs[i].add} labels ${Object.keys(conf.inputs[i].parser).map(l => conf.inputs[i].parser[l].label).join()} error ${e.message}`);
        }
        // read delay
        await this.delay(conf.bus.read_delay);
      }
      resolve();
    });
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
