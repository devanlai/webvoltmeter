/*
 * HiDANCE USB Energy Meter access via Web Bluetooth
 */

import { BaseBLEDevice, UUIDFactory } from './ble.js';

// HiDANCE UUIDs use this template:
const HiDANCE_UUID_TEMPLATE = "0000xxxx-0000-1000-8000-00805f9b34fb";

let hidance_uuid128 = UUIDFactory(HiDANCE_UUID_TEMPLATE);
const HIDANCE_SERVICE_UUID = hidance_uuid128(0xFFE0);
const HIDANCE_SERVICE_CHAR_UUID = hidance_uuid128(0xFFE1);

function getUint24(dataview, byteOffset, littleEndian=false) {
    if (littleEndian) {
        return ((dataview.getUint8(byteOffset)   <<  0)
              | (dataview.getUint8(byteOffset+1) <<  8)
              | (dataview.getUint8(byteOffset+2) << 16));
    } else {
        return ((dataview.getUint8(byteOffset)   << 16)
              | (dataview.getUint8(byteOffset+1) <<  8)
              | (dataview.getUint8(byteOffset+2) <<  0));
    }
}

class HiDANCEEnergyMeter extends BaseBLEDevice {
    constructor(device) {
        super(device);
        this.characteristic = null;
        this._info_callbacks = [];
        this._data_callbacks = [];
        this._packet_callbacks = [];

        this._first_chunk = null;
        this._first_chunk_timestamp = null;
        this._second_chunk = null;
        this._second_chunk_timestamp = null;
    }

    add_info_callback(callback) {
        if (!this._info_callbacks.includes(callback)) {
            this._info_callbacks.push(callback);
        }
    }

    remove_info_callback(callback) {
        const index = this._info_callbacks.indexOf(callback);
        if (index > -1) {
            this._info_callbacks.splice(index, 1);
        }
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
                let view = new DataView(data.buffer);
                // Dispatch callbacks for the complete data
                for (let callback of this._data_callbacks) {
                    await callback(view);
                }

                let info = this.parse_data(view);
                if (info) {
                    // Dispatch callbacks for the parsed information
                    for (let callback of this._info_callbacks) {
                        await callback(info);
                    }
                }
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

    parse_data(dataview) {
        const mode = dataview.getUint8(3);
        if (mode == 1) {
            let info = {
                mode:               mode,
                voltage_v:          getUint24(dataview, 4) / 10.0,
                current_a:          getUint24(dataview, 7) / 1000.0,
                power_w:            getUint24(dataview, 10) / 10.0,
                energy_wh:          dataview.getUint32(13) * 10.0,
                price_per_kwh:      getUint24(dataview, 17) / 100.0,
                frequency_hz:       dataview.getUint16(20) / 10.0,
                power_factor:       dataview.getUint16(22) / 1000.0,
                temp_c:             dataview.getUint16(24),
                backlight_time_s:   dataview.getUint8(30),
            };
            return info;
        } else if (mode == 2) {
            let info = {
                mode:               mode,
                voltage_v:          getUint24(dataview, 4) / 10.0,
                current_a:          getUint24(dataview, 7) / 1000.0,
                charge_ah:          getUint24(dataview, 10) / 100.0,
                energy_wh:          dataview.getUint32(13) * 100.0,
                price_per_kwh:      getUint24(dataview, 17) / 100.0,
                temp_c:             dataview.getUint16(24),
                backlight_time_s:   dataview.getUint8(30),
            };
            return info;
        } else if (mode == 3) {
            let info = {
                mode:               mode,
                voltage_v:          getUint24(dataview, 4) / 100.0,
                current_a:          getUint24(dataview, 7) / 100.0,
                charge_ah:          getUint24(dataview, 10) / 1000.0,
                energy_wh:          dataview.getUint32(13) / 100.0,
                usb_dp_v:           dataview.getUint16(17) / 100.0,
                usb_dm_v:           dataview.getUint16(19) / 100.0,
                temp_c:             dataview.getUint16(21),
                on_time_s:          dataview.getUint16(23),
                backlight_time_s:   dataview.getUint8(30),
            };
            return info;
        } else {
            return null;
        }
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
        // Accept any of the known models by name
        options.filters = [
            { name: "JDY-19" },
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
