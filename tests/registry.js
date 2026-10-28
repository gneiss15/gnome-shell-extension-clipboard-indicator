import GLib from 'gi://GLib';
import { Registry, ClipboardEntry } from '../registry.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
const directory = GLib.dir_make_tmp('clipboard-registry-test-XXXXXX');
function instance() {
    const registry = new Registry({ settings: { get_int: () => 100 }, uuid: 'isolated-test' });
    registry.REGISTRY_DIR = directory;
    registry.REGISTRY_PATH = `${directory}/registry.txt`;
    registry.BACKUP_REGISTRY_PATH = `${directory}/registry.txt~`;
    return registry;
}
const registry = instance();
const text = new ClipboardEntry('text/plain', new TextEncoder().encode('ä😀'), false);
const pin = new ClipboardEntry('text/plain', new TextEncoder().encode('favorite'), true);
pin.setTag('tag');
registry.write([text, pin]);
let entries = await registry.read();
assert(entries.length === 2, 'add/read failed');
assert(entries[0].getStringValue() === 'ä😀', 'Unicode roundtrip');
assert(entries[1].isFavorite() && entries[1].getTag() === 'tag', 'favorite/tag lost');
registry.write([pin]);
entries = await instance().read(); // Must wait for previous instance's outstanding write.
assert(entries.length === 1 && entries[0].getStringValue() === 'favorite', 'remove/re-enable roundtrip');
for (let i = 0; i < 1000; i++) {
    text.setText(`state-${i}`); registry.write([text]);
}
text.setText('unsaved mutation');
assert(await registry.flush(), 'flush failed');
entries = await registry.read();
assert(entries[0].getStringValue() === 'state-999', 'snapshot mutated or older write won');
registry.write([]);
assert((await registry.read()).length === 0, 'clear/read failed');
print('Registry: add, remove, favorites/tags, re-enable, mutable entry snapshots, burst and clear roundtrips passed.');
print(`Isolated test files retained at ${directory}`);
