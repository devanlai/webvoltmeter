/*
 * Javascript for the demo voltmeter application
 */
import {html, render} from 'https://unpkg.com/lit-html?module';

import {request_device} from './hidance.js';

let session = {
    enabled: false,
    status: "Click connect to connect to a device",
    connected: false,
    device: null,
    ui_root: null,
    latest: {},
};

function show_error_dialog(error, error_title=null) {
    let dialog = document.createElement("dialog");
    if (!error_title) {
        error_title = "Uh oh! Something went wrong.";
    }
    let dialog_content = html`
        <h1>${error_title}</h1>
        <p>${error}</p>
        <button @click=${(evt) => dialog.close()}>Close</button>`;
    render(dialog_content, dialog);
    dialog.addEventListener("close", (evt) => {
        dialog.remove();
    });

    document.querySelector("body").appendChild(dialog);

    dialog.showModal();
}

async function on_disconnect(device, event) {
    session.connected = false;
    session.status = "Disconnected. Click connect to connect to another device."
    session.device = null;
    render(demo_application_template(session), session.ui_root);
}

function on_info(info) {
    console.log(info);
    session.latest = info;
    render(demo_application_template(session), session.ui_root);
}

async function on_click_connect(event) {
    try {
        session.device = await request_device();
        if (session.device) {
            session.device.add_disconnect_callback(on_disconnect);
            await session.device.initialize();
            session.connected = true;
            session.status = `Connected to ${session.device.name}`;
            render(demo_application_template(session), session.ui_root);
            session.device.add_info_callback(on_info);
            await session.device.start_notifications();
        } else {
            render(demo_application_template(session), session.ui_root);
        }
    } catch (err) {
        show_error_dialog(err);
    }
}

async function on_click_disconnect(event) {
    try {
        if (session.device) {
            await session.device.disconnect();
            session.device = null;
            session.connected = false;
            render(demo_application_template(session), session.ui_root);
        }
    } catch (err) {
        show_error_dialog(err);
    }
}

const demo_application_template = (session) =>
    html`<div>
           <div>${session.status}</div>
           <button @click=${session.connected ? on_click_disconnect : on_click_connect} ?disabled=${!session.enabled}>
             ${session.connected ? "Disconnect" : "Connect"}
           </button>
         </div>
         <div id="meter-display" class="meter-display">
           <div id="voltage"><label>Voltage:</label> ${format_value(session.latest.voltage_v, 2, "V")}</div>
           <div id="current"><label>Current:</label> ${format_value(session.latest.current_a, 2, "A")}</div>
           <div id="charge"><label>Charge:</label> ${format_value(session.latest.charge_ah, 3, "Ah")}</div>
           <div id="energy"><label>Energy:</label> ${format_value(session.latest.energy_wh, 2, "Wh")}</div>
           <div id="usb-dp"><label>USB D+:</label> ${format_value(session.latest.usb_dp_v, 2, "V")}</div>
           <div id="usb-dp"><label>USB D-:</label> ${format_value(session.latest.usb_dm_v, 2, "V")}</div>
           <div id="temperature"><label>Temperature:</label> ${format_value(session.latest.temp_c, 0, "C")}</div>
         </div>`;


async function get_web_bluetooth_availability() {
    let supported = (navigator.bluetooth != null);
    let available = false;
    if (supported) {
        available = await navigator.bluetooth.getAvailability();
    }
    return { supported: supported, available: available };
}


function web_bluetooth_status_html(availability) {
    if (availability.available) {
        return html`
            <p>
                <span role="image" aria-label="check">✔</span>
                Web Bluetooth is available in your browser. To begin the demo,
                turn on your compatible BLE voltmeter, ensure no other devices
                are connected to it over BLE, and press the connect button below.
            </p>`;
    } else if (availability.supported) {
        return html`
            <p>
                <span role="image" aria-label="x">❌</span>
                Your browser supports Web Bluetooth, but the Web Bluetooth
                feature is currently unavailable. One of the following situations
                may apply:
                <ul>
                    <li>Your device does not have a BLE capable radio</li>
                    <li>Your device's BLE radio is disabled or powered down</li>
                    <li>You or your organization have instructed your browser to deny
                        access to the Web Bluetooth feature.</li>
                </ul>
            </p>`;
    } else {
        return html`
            <p>
              <span role="image" aria-label="x">❌</span>
              Your browser does not seem to support Web Bluetooth. This demo
              cannot function without Web Bluetooth. In the future, I hope to
              add a screencast showing the demo functionality for those that
              are interested in seeing what the demo can do without needing
              the hardware or a Web Bluetooth enabled browser.
              For details on which browsers are supported, see <a href="https://caniuse.com/#feat=web-bluetooth">caniuse.com</a>.
            </p>`;
    }
}

function format_value(value, precision, unit) {
    if (value === undefined || isNaN(value)) {
        if (precision > 0) {
            return "-." + ("-".repeat(precision)) + " " + unit;
        } else if (precision == 0) {
            return "-" + " " + unit;
        } else {
            return "-".repeat(-precision) + " " + unit;
        }
    } else {
        if (precision >= 0) {
            return value.toFixed(precision) + " " + unit;
        } else {
            return (Math.round(value / Math.pow(10, -precision)) * Math.pow(10, -precision)).toFixed(0) + " " + unit;
        }
    }
}

document.addEventListener('DOMContentLoaded', event => {
    const demo_ble_check = document.getElementById("demo-ble-check");
    const demo_application = document.getElementById("demo-application");
    session.ui_root = demo_application;

    let ble_availability = get_web_bluetooth_availability();
    const availability_loading_html = html`
        <p>
            <span role="image" aria-label="hourglass">⌛</span>Checking Web Bluetooth availability.
        </p>`;

    render(availability_loading_html, demo_ble_check);
    ble_availability.then(avail => {
        session.enabled = avail.available;
        render(web_bluetooth_status_html(avail), demo_ble_check);
        render(demo_application_template(session), demo_application);
    });

});
