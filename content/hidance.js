/*
 * HiDANCE USB Energy Meter access via Web Bluetooth
 */

import { BaseBLEDevice, UUIDFactory } from './ble.js';

// HiDANCE UUIDs use this template:
const HiDANCE_UUID_TEMPLATE = "0000xxxx-0000-1000-8000-00805f9b34fb";

let hidance_uuid128 = UUIDFactory(HiDANCE_UUID_TEMPLATE);
const HIDANCE_SERVICE_UUID = hidance_uuid128(0xFFE0);
const HIDANCE_SERVICE_CHAR_UUID = hidance_uuid128(0xFFE1);

class HiDANCEEnergyMeter extends BaseBLEDevice {
    
}

async function request_device(name) {
    var options = {
        // List all of the services we want to be able to access
        optionalServices: [HIDANCE_SERVICE_UUID]
    };
    if (name) {
        options.filters = [ { name: name } ];
    } else {
        //options.filters = [ { services: [ davis.COMMAND_SERVICE_UUID] } ]
        options.filters = [
            { namePrefix: "JDY" },
        ];
    }

    try {
        let device = await navigator.bluetooth.requestDevice(options);

    } catch (err) {
        if (err.code == DOMException.NOT_FOUND_ERR) {
            // Return null if the user cancelled device selection
            return null;
        } else {
            throw err;
        }
    }
}