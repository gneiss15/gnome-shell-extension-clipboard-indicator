import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

const file = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('extension.js');
const [, bytes] = file.load_contents(null);
const source = new TextDecoder().decode(bytes);
const start = source.indexOf('        let white, selectionBlue;');
const end = source.indexOf('        clutterText.color = white;', start);
if (start < 0 || end < 0) throw new Error('Editor color construction not found');
const construct = new Function('Clutter', 'Cogl', source.slice(start, end) + '\nreturn [white, selectionBlue];');
const colors = construct(Clutter, Cogl);
for (const property of ['color', 'selection-color', 'selected-text-color']) {
    const expected = Clutter.Text.find_property(property).value_type;
    for (const color of colors) {
        if (!GObject.type_is_a(color.constructor.$gtype, expected))
            throw new Error(`Wrong color type for ${property}`);
    }
}
if (colors[0].alpha !== 255 || colors[1].alpha !== 181)
    throw new Error('Incorrect GNOME 46 color components');
// Exercise the newer API branch without requiring a second Shell installation.
class NewColor { init_from_4f(...rgba) { this.rgba = rgba; } }
const newerColors = construct({}, { Color: NewColor });
if (newerColors[0].rgba.join() !== '1,1,1,1' || newerColors[1].rgba.join() !== '0.39,0.59,1,0.71')
    throw new Error('Newer color API fallback failed');
print('Editor colors: real GNOME 46 property types and simulated newer API branch passed.');
