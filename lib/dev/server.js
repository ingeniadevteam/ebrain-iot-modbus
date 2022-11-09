"use strict";

const ModbusRTU = require('modbus-serial');

module.exports = async function (app, host, port) {
  // setup a ModbusTCP Server
  var vector = {
    getInputRegister: function(addr) {
      return Math.floor(Math.random() * 30) + 15;
    },
    getHoldingRegister: function(addr) {
      return Math.floor(Math.random() * 30) + 15;
    },
    getCoil: function(addr) {
      return (addr % 2) === 0;
    },
    setRegister: function(addr, value) {
      app.logger.debug('set register', addr, value);
      return;
    },
    setCoil: function(addr, value) {
      app.logger.debug('set coil', addr, value);
      return;
    }
  };
  // start the server
  try {
    const server = await new ModbusRTU.ServerTCP(vector, {
      host: host,
      port: port
    });
    app.logger.info(`started modbus TCP server on modbus://${host}:${port}`);
  } catch (e) {
    app.logger.error(`modbus TCP server failed`);
  }
};
