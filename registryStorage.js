import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { WriteQueue } from './writeQueue.js';

// Shared across Registry instances, including disable/enable in the same Shell.
const writers = new Map();

export function replaceContents(path, bytes) {
    return new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).replace_contents_bytes_async(
            bytes, null, false, Gio.FileCreateFlags.PRIVATE, null, (file, result) => {
                try {
                    file.replace_contents_finish(result);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export function registryWriter(path) {
    if (!writers.has(path)) {
        const deletedImages = new Set();
        const writer = new WriteQueue(async ({ registry, images }) => {
            const directory = GLib.path_get_dirname(path);
            if (GLib.mkdir_with_parents(directory, 0o700) !== 0)
                throw new Error(`Clipboard Indicator: cannot create ${directory}`);
            // Image data must exist before a registry referencing it is committed.
            for (const { filename, bytes } of images) {
                if (!GLib.file_test(filename, GLib.FileTest.EXISTS))
                    await replaceContents(filename, bytes);
            }
            // Gio's local-file backend replaces via a temporary file and rename.
            // This operation handles full writes and close errors as one result.
            await replaceContents(path, new GLib.Bytes(JSON.stringify(registry)));
            // Defer image removal until a registry no longer referencing it has
            // committed. A newer snapshot restores its bytes if it reuses an image.
            const referenced = new Set(registry.map(item => item.contents));
            for (const filename of deletedImages) {
                if (referenced.has(filename)) continue;
                try {
                    const file = Gio.File.new_for_path(filename);
                    await new Promise((resolve, reject) => file.delete_async(
                        GLib.PRIORITY_DEFAULT, null, (object, result) => {
                            try { object.delete_finish(result); resolve(); }
                            catch (error) { reject(error); }
                        }));
                    deletedImages.delete(filename);
                } catch (error) {
                    if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                        deletedImages.delete(filename);
                    else console.error('Clipboard Indicator: image cleanup failed', error);
                }
            }
        }, {
            schedule: (callback, delay) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                callback();
                return GLib.SOURCE_REMOVE;
            }),
            cancel: id => GLib.Source.remove(id),
            report: error => console.error('Clipboard Indicator: registry write failed', error),
        });
        writer.deleteImage = filename => deletedImages.add(filename);
        writers.set(path, writer);
    }
    return writers.get(path);
}
