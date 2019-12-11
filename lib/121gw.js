/*
 * EEVBlog 121GW Multimeter access via Web Bluetooth
 */

import { BaseBLEDevice } from './ble.js';

/* BLE UUIDs */
const EEV121GW_SERVICE_UUID = "0bd51666-e7cb-469b-8e4d-2742f1ba77cc";
const EEV121GW_SERVICE_CHAR_UUID = "e7add780-b042-4876-aae1-112855353cc1";

/* Number of bytes in a complete data frame */
const FRAME_LEN = 19;

/* Start byte for all data frames */
const START_BYTE = 0xF2;

class EEV121GWMultimeter extends BaseBLEDevice {
    /**
     * Represents an EEV121GW Multimeter connected via BLE.
     * @constructor
     * @override
     * @param {BluetoothDevice} device - the native WebBluetooth object to wrap
     */
    constructor(device) {
        super(device);
        this.characteristic = null;
        this._info_callbacks = [];
        this._data_callbacks = [];
        this._packet_callbacks = [];

        // Scratch buffer to hold packet bytes while searching for the actual
        // start-of-packet byte
        this._packet_buffer = new Uint8Array(FRAME_LEN * 3);
        this._packet_len = 0;
    }

    /**
     * Register a callback to run whenever decoded measurements are available.
     * The callback will be passed a single object with the decoded values
     * as attributes. The attributes will depend on the data frame type.
     * 
     * @param {*} callback - a callback to execute upon decoding a frame
     */
    add_info_callback(callback) {
        if (!this._info_callbacks.includes(callback)) {
            this._info_callbacks.push(callback);
        }
    }

    /**
     * Unregister a previously registered info callback.
     * 
     * @param {*} callback 
     */
    remove_info_callback(callback) {
        const index = this._info_callbacks.indexOf(callback);
        if (index > -1) {
            this._info_callbacks.splice(index, 1);
        }
    }

    /**
     * Register a callback to run whenever a complete data frame has
     * been received. The callback will be passed a DataView representing
     * the entire logical data frame, constructed by concatenating together
     * individual characteristic value updates.
     * 
     * @param {*} callback - a callback to execute upon reconstructing a complete data frame
     */
    add_data_callback(callback) {
        if (!this._data_callbacks.includes(callback)) {
            this._data_callbacks.push(callback);
        }
    }

    /**
     * Unregister a previously registered data callback.
     * 
     * @param {*} callback 
     */
    remove_data_callback(callback) {
        const index = this._data_callbacks.indexOf(callback);
        if (index > -1) {
            this._data_callbacks.splice(index, 1);
        }
    }

    /**
     * Register a callback to run whenever a characteristic value update packet
     * is received. The callback will be passed a DataView representing the raw
     * updated characteristic value.
     * 
     * @param {*} callback - a callback to execute upon receiving a characteristic update.
     */
    add_packet_callback(callback) {
        if (!this._packet_callbacks.includes(callback)) {
            this._packet_callbacks.push(callback);
        }
    }

    /**
     * Unregister a previously registered packet callback.
     * 
     * @param {*} callback 
     */
    remove_packet_callback(callback) {
        const index = this._packet_callbacks.indexOf(callback);
        if (index > -1) {
            this._packet_callbacks.splice(index, 1);
        }
    }

    /**
     * Perform internal initialization after connecting to a device for
     * the first time. At a minimum, finding and caching service/characteristic
     * handles.
     * 
     * @override
     * @param {BluetoothRemoteGATTServer} gatt_server - the GATT server representing the remote device
     */
    async setup(gatt_server) {
        const service = await gatt_server.getPrimaryService(EEV121GW_SERVICE_UUID);
        this.characteristic = await service.getCharacteristic(EEV121GW_SERVICE_CHAR_UUID);
        this.characteristic.addEventListener("characteristicvaluechanged", async event => {
            await this.handle_indication(event.currentTarget.value);
        });
    }

    /**
     * Internal helper to check if a byte sequence appears to be a valid frame
     *
     * @param {DataView} dataview - dataview of the data to validate
     */
    validate_frame(dataview) {
        // Must be the expected, fixed length
        if (dataview.byteLength != FRAME_LEN) {
            return false;
        }

        // Must start with the start byte
        if (dataview.getUint8(0) != START_BYTE) {
            return false;
        }

        // Verify that the checksum is correct - it come out to zero.
        let checksum = 0;
        for (let i=0; i < FRAME_LEN; i++) {
            checksum = checksum ^ dataview.getUint8(i);
        }

        return (checksum == 0);
    }

    _skip_to_next_start_byte(n) {
        // Discard the first n bytes unconditionally, then discard
        // any following bytes until we find a start byte. Remaining
        // bytes are shifted to the beginning of the buffer such that
        // the buffer is either empty or starts with a start byte
        let m = -1;
        for (let i=n; i < this._packet_len; i++) {
            if (this._packet_buffer[i] == START_BYTE) {
                m = i;
                break;
            }
        }

        if (m == -1) {
            // Just discard everything
            this._packet_len = 0;
        } else {
            for (let j=m; j < this._packet_len; j++) {
                this._packet_buffer[j-m] = this._packet_buffer[j];
            }

            this._packet_len -= m;
        }
    }

    /**
     * Internal handler to process indications used to send data through
     * the device's data characteristic.
     * 
     * @param {DataView} dataview - dataview of a single characteristic value update
     */
    async handle_indication(dataview) {
        // Dispatch callbacks for the individual packet
        for (let callback of this._packet_callbacks) {
            await callback(dataview);
        }

        if (this._packet_len == 0 && this.validate_frame(dataview)) {
            // Everything is aligned nicely and this packet contains
            // one complete frame
            this.handle_frame(dataview);
        } else if (this._packet_len > 0) {
            // Concatenate this packet with the previous one and check
            // if they form a complete frame together
            this._packet_buffer.set(new Uint8Array(dataview.buffer, dataview.byteOffset), this._packet_len);
            this._packet_len += dataview.byteLength;
            while (this._packet_len >= FRAME_LEN) {
                let frame_dataview = new DataView(this._packet_buffer.buffer, this._packet_buffer.byteOffset, FRAME_LEN);
                if (this.validate_frame(frame_dataview)) {
                    this.handle_frame(frame_dataview);
                    this._skip_to_next_start_byte(FRAME_LEN);
                } else {
                    // Oops, not actually a valid frame. Discard bytes
                    // until we find another start byte.
                    this._skip_to_next_start_byte(1);
                }
            }
        } else {
            // This packet doesn't have a complete frame. Save anything
            // that follows a start byte and we'll concatenate the next packet
            // with it to form a complete frame.
            for (let i=0; i < dataview.byteLength; i++) {
                if (dataview.getUint8(i) == START_BYTE) {
                    this._packet_buffer.set(new Uint8Array(dataview.buffer, dataview.byteOffset+i));
                    this._packet_len += dataview.byteLength;
                    break;
                }
            }
        }
    }

    async handle_frame(dataview) {
        for (let callback of this._data_callbacks) {
            await callback(dataview);
        }

        let info = this.parse_data(dataview);
        if (info) {
            // Dispatch callbacks for the parsed information
            for (let callback of this._info_callbacks) {
                await callback(info);
            }
        }
    }
    
    /**
     * Start streaming measurement packets from the device.
     */
    async start_indications() {
        await this.characteristic.startNotifications();
    }

    /**
     * Stop streaming measurement packets from the device.
     */
    async stop_indications() {
        await this.characteristic.stopNotifications();
    }

    /**
     * Internal helper to decode measurement frames.
     * @param {DataView} dataview - dataview of a complete measurement frame
     * @returns an info object with measurement values as attributes
     */

    parse_data(dataview) {
        /* The serial number is a BCD encoded sequence of YYMNNNNN
         *   YY is the two digit year relative to 2000
         *   M is the one digit month? Possibly not actually BCD...
         *   NNNNN is the user-configurable 5-digit serial number
         */
        const serial_digits = dataview.getUint32(1).toString(16).padStart(8, '0');
        const mfg_year = Number.parseInt(serial_digits.slice(0,2), 10);
        const mfg_month = Number.parseInt(serial_digits.slice(2,3), 16);
        const serial_number = Number.parseInt(serial_digits.slice(3), 10);

        let info = {
            mfg_year:               mfg_year,
            mfg_month:              mfg_month,
            serial_number:          serial_number,
            main_mode:              dataview.getUint8(5) & 0x0F,
            main_range:             dataview.getUint8(6),
            main_value:             ((dataview.getUint8(5) & 0xC0) << 10) | dataview.getUint16(7),
            sub_mode:               dataview.getUint8(9),
            sub_range:              dataview.getUint8(10),
            sub_value:              dataview.getUint16(11),
            bar_status:             dataview.getUint8(13),
            bar_value:              dataview.getUint8(14),
            icon_status: [
                dataview.getUint8(15),
                dataview.getUint8(16),
                dataview.getUint8(17)
            ]
        }

        return info;
    }
}

/**
 * Request to connect to a compatible energy meter.
 * The user will be prompted to select a matching device.
 * This can only be initiated in the same event/callback chain as a user gesture.
 * 
 * @param {string} name - optional - specific name of the device to request
 * @returns {EEV121GWMultimeter} - an energy meter object representing the connected device
 */

async function request_device(name) {
    let filter = {
        services: [ EEV121GW_SERVICE_UUID ]
    };

    if (name) {
        filter.name = name;
    }

    const options = { filters: [filter] };

    try {
        let device = await navigator.bluetooth.requestDevice(options);
        return new EEV121GWMultimeter(device);
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
    EEV121GWMultimeter,
    request_device
};
