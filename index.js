"use strict";

const { readFileSync } = require('fs');
const loadJsonFile = require('load-json-file');
const Modbus = require('./lib');

module.exports = async (app) => {
    if (!app.modbus.module) {
        // init the modbus module
        let configObject = {};
        try {
            // load config
            const configFile = readFileSync(`${app.configDir}/modbus.json`).toString();
            configObject = JSON.parse(configFile);
            // validate
            app.modbus.config = await require(`./lib/validation`)(configObject);
            
            // load and init the modbus module
            app.modbus.module = new Modbus();
            await app.modbus.module.init(app);
        } catch (error) {
            app.logger.error(`Modbus ${error.message}`);
        }
    }
    
    let data = {};
    if (process.env.NODE_ENV === 'development') {
        try {
            data = await loadJsonFile(`devdata/modbus.json`);
            if (data) app.modbus.data = data;
        } catch (error) {
            app.logger.error(`modbus devdata: ${error.message}`);
        }
    } else {
        data = await app.modbus.module.read(app);
        if (data) app.modbus.data = data;
    }
};