"use strict";

const joi = require('joi');

const bus = joi.object({
  name: joi.string().default("ttyUSB0"),
  type: joi.string().valid('TCP', 'UDP').default("UDP"),
  serial_port: joi.string().default("/dev/ttyUSB0"),
  dev_serial_port: joi.string().default(""),
  baudrate: joi.number().default(9600),
  parity: joi.string().valid('none', 'even', 'mark', 'odd', 'space').default("none"),
  timeout: joi.number().min(10).max(3000).default(1000),
  read_delay: joi.number().min(5).max(3000).default(20),
  write_delay: joi.number().min(5).max(3000).default(40),
  host: joi.string().default("127.0.0.1"),
  port: joi.number().default(1502),
  development_server: joi.boolean().default(false),
  enabled: joi.boolean().default(true),
}).unknown();

const parser = joi.object({
  label: joi.string().default("First"),
  unit: joi.string().default("?"),
  scale: joi.number().default(1),
}).unknown().default();

const modbusItem = joi.object({
  id: joi.number().default(1),
  add: joi.number().default(1),
  num: joi.number().default(1),
  fc: joi.string().valid(
    "readCoils",
    "readDiscreteInputs",
    "readHoldingRegisters",
    "readInputRegisters",
    "readDeviceIdentification",
    "writeCoil",
    "writeRegister",
    "writeCoils",
    "writeRegisters"
  ).default("readHoldingRegisters"),
  format: joi.string().default("<H(first)"),
  parser: joi.object().pattern(/^/, parser).default()
}).unknown().default();

const modbusSchema = joi.array().items({
  bus: bus.default(),
  inputs: joi.array().items(modbusItem),
  outputs: joi.array().items(modbusItem)
});


module.exports = async function (schemaObject) {
  // we need an array
  if (!(schemaObject instanceof Array)) {
    schemaObject = [{ }];
  }
  // validate the config object
  const validation = modbusSchema.validate(schemaObject);
  if (validation.error) {
    const errors = [];
    validation.error.details.forEach( detail => {
      errors.push(detail.message);
    });
    // process failed
    throw new Error(`modbus validation error: ${errors.join(", ")}`);
  }

  return validation.value;
};
