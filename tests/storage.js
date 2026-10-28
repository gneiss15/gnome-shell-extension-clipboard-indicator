import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { registryWriter, replaceContents } from '../registryStorage.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function read(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, 'read failed');
    return JSON.parse(new TextDecoder().decode(bytes));
}
const directory = GLib.dir_make_tmp('clipboard-indicator-test-XXXXXX');
const path = `${directory}/registry.txt`;
const writer = registryWriter(path);
assert(writer === registryWriter(path), 'instances must share the same writer');
const persist = writer.persist;
let active = 0, peak = 0, writes = 0;
writer.persist = async snapshot => {
    active++; peak = Math.max(peak, active); writes++;
    try { await persist(snapshot); } finally { active--; }
};
const snapshot = n => ({ registry: [{ favorite: false, mimetype: 'text/plain', contents: `${n}: ä😀` }], images: [] });
writer.request(snapshot(0));
for (let i = 1; i <= 1000; i++) writer.request(snapshot(i));
assert(await writer.flush(), 'burst flush failed');
assert(read(path)[0].contents === '1000: ä😀', 'stale or corrupted JSON');
assert(peak === 1, 'overlapping registry writes');
assert(writes <= 2, 'pending writes were not coalesced');

let reads = 0, readError = null;
const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
    try { read(path); reads++; } catch (e) { readError = e; }
    return GLib.SOURCE_CONTINUE;
});
for (let i = 0; i < 10; i++) {
    writer.request({ registry: [{ contents: 'x'.repeat(500000) + i }], images: [] });
    assert(await writer.flush(), 'large replacement failed');
}
GLib.Source.remove(timer);
assert(!readError, `reader saw incomplete JSON: ${readError}`);
assert(reads > 0, 'concurrent reader never ran');

const cancelled = new Gio.Cancellable(); cancelled.cancel();
let cancelledFailed = false;
await new Promise(resolve => {
    Gio.File.new_for_path(path).replace_contents_bytes_async(new GLib.Bytes('invalid'), null, false,
        Gio.FileCreateFlags.PRIVATE, cancelled, (file, result) => {
            try { file.replace_contents_finish(result); } catch (_) { cancelledFailed = true; }
            resolve();
        });
});
assert(cancelledFailed, 'cancelled operation unexpectedly succeeded');
assert(read(path)[0].contents.endsWith('9'), 'cancellation damaged committed JSON');

const imagePath = `${directory}/image`;
writer.request({ registry: [{ mimetype: 'image/png', contents: imagePath }],
    images: [{ filename: imagePath, bytes: new GLib.Bytes('test image bytes') }] });
assert(await writer.flush(), 'image flush failed');
assert(GLib.file_test(read(path)[0].contents, GLib.FileTest.EXISTS), 'registry committed before image');

// A regular file where a directory should be reliably fails without permissions assumptions.
const blocked = `${directory}/blocked`;
await replaceContents(blocked, new GLib.Bytes('blocker'));
const failing = registryWriter(`${blocked}/registry.txt`);
let failures = 0; failing.report = () => failures++;
failing.request(snapshot(1));
assert(!await failing.flush(), 'unwritable destination should fail');
assert(failures > 0, 'failure was not reported');
Gio.File.new_for_path(blocked).move(Gio.File.new_for_path(`${directory}/blocker.saved`), Gio.FileCopyFlags.NONE, null, null);
failing.request(snapshot(2));
assert(await failing.flush(), 'write did not recover');
assert(read(`${blocked}/registry.txt`)[0].contents === '2: ä😀', 'recovery wrote stale state');
print(`Storage: burst, shared writer, Unicode JSON, concurrent reader (${reads} reads), cancellation, images and failure recovery passed.`);
print(`Isolated test files retained at ${directory}`);

// Removed images must not be resurrected by an older in-flight snapshot.
const removedImage = `${directory}/removed-image`;
writer.request({ registry: [{ mimetype: 'image/png', contents: removedImage }],
    images: [{ filename: removedImage, bytes: new GLib.Bytes('temporary test image') }] });
writer.deleteImage(removedImage);
writer.request({ registry: [], images: [] });
assert(await writer.flush(), 'image removal flush failed');
assert(!GLib.file_test(removedImage, GLib.FileTest.EXISTS), 'removed image resurrected');
assert(read(path).length === 0, 'clear did not persist');
// A real existing image is removed only after its registry reference disappears.
writer.deleteImage(imagePath);
writer.request({ registry: [], images: [] });
assert(await writer.flush(), 'existing image removal failed');
assert(!GLib.file_test(imagePath, GLib.FileTest.EXISTS), 'unreferenced image was not removed');
print('Image cleanup: in-flight removal and committed-reference ordering passed.');
