HiDANCE USB Energy Meter Reverse Engineering Notes
==================================================

Available on [AliExpress](https://www.aliexpress.com/item/32854413847.html) in three versions:
* a monochrome LCD version
* a color LCD version
* a color LCD version with Bluetooth

These notes apply to the third version, which, as of writing, costs about $9 plus shipping.

Mechanical
----------
The meter is housed in a smoky translucent grey plastic case. On top, it is labeled as "USB ENERGY METER".
On the back, it lists the product name as "USB Energy Meter" and the product model as "J7-H".
Near the male USB A connector, there is a slot on the plastic case below the warning text.

The case is held together by three pairs of plastic pins which extend from the top half of the case into matching holes on the bottom half of the case. The pins are very thin and bend easily when removing the case, so take care not to open the case at too extreme of an angle - ideally the two halves should separate while remaining parallel to each other.

The PCBA is only held in the case by friction and can be removed freely.
The bottom side of the PCBA has an unmarked castellated Bluetooth module soldered on. The radio IC's markings have been sanded off. Of the 24 pins on the module, only six appear to be soldered.

There are four small, plated through hole pads on the underside of the PCBA with 2mm spacing. I have not attempted to probe these pins for debug/trace functionality.

The bottom silkscreen reads "AnJie" just below the pushbutton.
Beneath the foam block that supports the display, the top silkscreen appears to read "HiDANCE ATORCH".
The top silkscreen also reads "Mode: J7-H" next to the pushbutton.


Official applications
---------------------
There are official iOS and Android applications, but of course I have not tested them. The Android app is hosted on [MediaFire](https://www.mediafire.com/folder/31bc15uhq8odb/E-meter), which doesn't speak well to its trustworthiness.

Bluetooth Descriptors
---------------------
The device sends advertisement packets with the following information, as captured by nRF Connect:

    Connectable: Yes
    Advertising Type: Legacy
    Flags: GeneralDiscoverable, BrEdrNotSupported
    Incomplete List of 16-bit Service UUIDs: 0xFFE0, 0xFEE7
    Manufacturer data (Bluetooth Core 4.1):
        Company: Reserved ID <0x4AEA> 0x88A01908081067FA
    Shortened Local Name: JDY-19

Upon connecting, the device has a primary service UUID of:

    0000ffe0-0000-1000-8000-00805f9b34fb

That service has one characteristic, with a UUID of:

    0000ffe1-0000-1000-8000-00805f9b34fb

The characteristic supports `NOTIFY`, `READ`, `WRITE`, `WRITE NO RESPONSE`.
It appears that the client characteristic configuration is automatically set to enable notifications as soon as the device is connected.

Searching for "000ffe0-0000-1000-8000-00805f9b34fb", it turns up as a common UUID in sample code, presumably because it falls within the reserved UUID space used by the Bluetooth SIG for 16-bit UUIDs. It is not officially assigned to any particular entity, and thus is not a good idea to use. Unfortunately, this makes the service UUID not actually unique, so when trying to detect compatible devices, it would be a bad idea to filter on only the service UUID.

To avoid false positives, it would be best to filter on both the device name "JDY-19" in addition to searching for the service UUID.

Bluetooth Protocol
------------------

### Bluetooth notifications

The device automatically sends notifications on the `ffe1` characteristic. The actual payload is 36 bytes, split across a 20-byte value followed by a 16-byte value.

Apart from length, the first chunk can be identified by always starting with `FF 55`. The Android application checks that the first byte is `FF` and the third byte is `01`.

### Bluetooth command framing

The device accepts commands written to the `ffe1` characteristic.
Commands sent to the characteristic seem to adhere to the following 10-byte format:

On one line:

    FF 55 11 <adu> <a2> <a3> 00 <a4> <a5> <checksum>

* The first three bytes appear to be a fixed header.
* The fourth byte, based on the Android application, appears to be some kind of device mode selection referred to as the "adu", which can take on values from 1-3.
* The fifth, sixth, eighth, and ninth bytes appear to be used to passed parameters.
* The seventh byte appears to always be set to zero.
* The tenth byte seems to be a checksum constructed by summing together the third through ninth bytes and then xor'ing them with 0x44.

### Bluetooth commands
Command sequences that are known to exist:

| Name                  | a2   | a3       | a4       | a5       | UI notes |
| --------------------- | ---- | -------- | -------- | -------- | -------- |
| button_jia            | 0x33 | 0x00     | 0x00     | 0x00     | Corresponds to a right button icon |
| button_jian           | 0x34 | 0x00     | 0x00     | 0x00     | Corresponds to a left button icon  |
| button_ok             | 0x32 | 0x00     | 0x00     | 0x00     | Unknown usage |
| button_set            | 0x31 | 0x00     | 0x00     | 0x00     | Unknown usage |
| clear capacity        | 0x02 | 0x00     | 0x00     | 0x00     | UI prompt reads "Cumulative capacity will be cleared" |
| clear time            | 0x03 | 0x00     | 0x00     | 0x00     | UI prompt reads "Cumulative time will be cleared" |
| clear power / all     | 0x01 | 0x00     | 0x00     | 0x00     | UI prompt reads "The cumulative power, carbon dioxide, the cumulative charge will be reset" if adu is not 3, otherwise it reads "The cumulative power will be reset" |
| set electricity cost  | 0x22 | C[23:16] | C[15:8]  | C[7:0]   | Appears to set the utility price, encoded as a little-endian price in cents |
| set backlight time?   | 0x21 | 0x00     | 0x00     | `<value>`| Seems to set some kind of backlight duration or timeout with a range from 1-59 |
