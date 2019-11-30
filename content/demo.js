/*
 * Javascript for the demo voltmeter application
 */
import {html, render} from 'https://unpkg.com/lit-html?module';
import {request_device} from './hidance.js';

const no_web_bluetooth_template =
    html`<p>
           <span role="image" aria-label="x">❌</span>
           Your browser does not seem to support Web Bluetooth. This demo
           cannot function without Web Bluetooth. In the future, I hope to
           add a screencast showing the demo functionality for those that
           are interested in seeing what the demo can do without needing
           the hardware or a Web Bluetooth enabled browser.
         </p>`;

const availability_loading_template = 
    html`<p>
           <span role="image" aria-label="hourglass">⌛</span>Checking Web Bluetooth availability.
         </p>`;
const web_bluetooth_unavailable_template = 
    html`<p>
           <span role="image" aria-label="x">❌</span>
           Your browser supports Web Bluetooth, but the Web Bluetooth
           feature is currently unavaiable. One of the following situations
           may apply:
           <ul>
             <li>Your device does not have a BLE capable radio</li>
             <li>Your device's BLE radio is disabled or powered down</li>
             <li>You or your organization have instructed your browser to deny
                 access to the Web Bluetooth feature.</li>
           </ul>
         </p>`;

const web_bluetooth_available_template = 
    html`<p>
           <span role="image" aria-label="check">✔</span>
           Web Bluetooth is available in your browser. To begin the demo,
           turn on your compatible BLE voltmeter, ensure no other devices
           are connected to it over BLE, and press the connect button below.
         </p>`;

let session = {
    connected: false,
    device: null,
    ui_root: null,
};

async function on_disconnect(device, event) {
    session.connected = false;
    session.device = null;
    render(demo_application_template(session), session.ui_root);
}
}

async function on_click_connect(event) {
    session.device = await request_device();
    if (session.device) {
        await session.device.initialize(on_disconnect);
        session.connected = true;
        render(demo_application_template(session), session.ui_root);
        //session.device.add_data_callback();
        await session.device.start_notifications();
    } else {
        render(demo_application_template(session), session.ui_root);
    }
}

async function on_click_disconnect(event) {
    if (session.device) {
        await session.device.disconnect();
        session.device = null;
        session.connected = false;
        render(demo_application_template(session), session.ui_root);
    }
}

const demo_application_template = (session) =>
    html`<div>
           <div>${session.connected ? ("Connected to " + session.device.name) : ""}</div>
           <button @click=${session.connected ? on_click_disconnect : on_click_connect}>
             ${session.connected ? "Disconnect" : "Connect"}
           </button>
         </div>
         <div>
         </div>`;

document.addEventListener('DOMContentLoaded', event => {
    const demo_ble_check = document.getElementById("demo-ble-check");
    const demo_application = document.getElementById("demo-application");
    session.ui_root = demo_application;

    let have_web_bluetooth = (navigator.bluetooth != null);
    if (have_web_bluetooth) {
        render(availability_loading_template, demo_ble_check);
        navigator.bluetooth.getAvailability().then(available => {
            if (available) {
                render(web_bluetooth_available_template, demo_ble_check);
                render(demo_application_template(session), demo_application);
            } else {
                render(web_bluetooth_unavailable_template, demo_ble_check);
            }
        });
    } else {
        render(no_web_bluetooth_template, demo_ble_check);
    }


});