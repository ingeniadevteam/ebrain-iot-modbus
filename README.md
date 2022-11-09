# modbus module

Config file example for SDM120 power meter:
```json
[
  {
    "bus": {
      "name": "SDM120",
      "baudrate": "2400"
    },
    "inputs": [
      {
        "id": 1,
        "add": 12,
        "num": 2,
        "fc": "writeFC3",
        "format": ">f(r12)",
        "parser": {
          "r12": {
            "label": "Pulse Width",
            "unit": "ms",
            "scale": 1
          }
        }
      }
    ],
    "outputs": [
      {
        "id": 1,
        "add": 12,
        "fc": "writeFC16",
        "format": ">f(r12)",
        "parser": {
          "r12": {
            "label": "Pulse Width",
            "unit": "ms",
            "scale": 1
          }
        }
      }
    ]
  }
]
```

## function

https://github.com/yaacov/node-modbus-serial/wiki/Methods


## format

https://github.com/ryanrolds/bufferpack

```
Format | C Type         | JavaScript Type   | Size (octets) | Notes
-------------------------------------------------------------------
A   | char[]         | Array             |     Length     |  (1)
x   | pad byte       | N/A               |        1       |
c   | char           | string (length 1) |        1       |  (2)
b   | signed char    | number            |        1       |  (3)
B   | unsigned char  | number            |        1       |  (3)
h   | signed short   | number            |        2       |  (3)
H   | unsigned short | number            |        2       |  (3)
i   | signed long    | number            |        4       |  (3)
I   | unsigned long  | number            |        4       |  (3)
l   | signed long    | number            |        4       |  (3)
L   | unsigned long  | number            |        4       |  (3)
S   | C string       | string            |        *       |  (6)
s   | char[]         | string            |     Length     |  (2)
f   | float          | number            |        4       |  (4)
d   | double         | number            |        8       |  (5)
```


## Module usage

**read() function**

Reads all inputs.

In main index.js:
```js
app.modbus.module.read().then( (data) => {
  app.logger.debug(data);
});
```

In any other async module:
```js
const data = await app.modbus.module.read();
```

**other read functions**

* readHoldingRegisters(id, add, num, unit, type, scale) to read registers

**write functions: values must be scaled by the app!!!**

* write(outLabel, value)
