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
    constructor(device) {
        super(device);
        this.characteristic = null;
        this._data_callbacks = [];
        this._packet_callbacks = [];

        this._first_chunk = null;
        this._first_chunk_timestamp = null;
        this._second_chunk = null;
        this._second_chunk_timestamp = null;
    }

    add_data_callback(callback) {
        if (!this._data_callbacks.includes(callback)) {
            this._data_callbacks.push(callback);
        }
    }

    remove_data_callback(callback) {
        const index = this._data_callbacks.indexOf(callback);
        if (index > -1) {
            this._data_callbacks.splice(index, 1);
        }
    }

    add_packet_callback(callback) {
        if (!this._packet_callbacks.includes(callback)) {
            this._packet_callbacks.push(callback);
        }
    }

    remove_packet_callback(callback) {
        const index = this._packet_callbacks.indexOf(callback);
        if (index > -1) {
            this._packet_callbacks.splice(index, 1);
        }
    }

    async setup(gatt_server) {
        const service = await gatt_server.getPrimaryService(HIDANCE_SERVICE_UUID);
        this.characteristic = await service.getCharacteristic(HIDANCE_SERVICE_CHAR_UUID);
        this.characteristic.addEventListener("characteristicvaluechanged", async event => {
            await this.handle_notification(event.currentTarget.value);
        });
    }

    async handle_notification(dataview) {
        // Dispatch callbacks for the individual packet
        for (let callback of this._packet_callbacks) {
            await callback(dataview);
        }

        // Check if this is a the first packet or the second packet in the sequence
        if (dataview.byteLength == 20 &&
            dataview.getUint8(0) == 0xFF && dataview.getUint8(2) == 0x01) {
            this._first_chunk = dataview.buffer;
            this._first_chunk_timestamp = Date.now();
        } else if (dataview.byteLength == 16) {
            this._second_chunk = dataview.buffer;
            this._second_chunk_timestamp = Date.now();
        }

        if (this._first_chunk !== null && this._second_chunk !== null) {
            const delta_ms = this._second_chunk_timestamp - this._first_chunk_timestamp;
            if (delta_ms >= 0 && delta_ms < 1000) {
                const data = new Uint8Array([
                    ...new Uint8Array(this._first_chunk),
                    ...new Uint8Array(this._second_chunk)
                ]);
                let view = new DataView(data);
                // Dispatch callbacks for the complete data
                for (let callback of this._data_callbacks) {
                    await callback(view);
                }

                // TODO: parse data and send parsed data via callback
            }

            this._first_chunk = null;
            this._first_chunk_timestamp = null;
            this._second_chunk = null;
            this._second_chunk_timestamp = null;    
        }
    }

    async start_notifications() {
        await this.characteristic.startNotifications();
    }

    async stop_notifications() {
        await this.characteristic.stopNotifications();
    }
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
        return new HiDANCEEnergyMeter(device);
    } catch (err) {
        if (err.code == DOMException.NOT_FOUND_ERR) {
            // Return null if the user cancelled device selection
            return null;
        } else {
            throw err;
        }
    }
}

export {
    HiDANCEEnergyMeter,
    request_device
};
