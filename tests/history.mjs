import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
const methods = ['_clearHistory', '_removeEntry', '_removeEntries', '_removeOldestEntries', '_moveItemFirst', '_favoriteToggle', '_setEntryLabel'];
const bodies = methods.map(name => {
    const start = source.indexOf(`    ${name} (`);
    const rest = source.slice(start + 1);
    const next = rest.search(/\n    (?:async )?[#\w]+ \(/);
    return (' ' + rest.slice(0, next)).replaceAll('#', '_');
}).join('\n');
const make = new Function('KEEP_SELECTED_ON_CLEAR', 'MAX_REGISTRY_LENGTH', 'NOTIFY_ON_CLEAR', '_',
    `return class History { ${bodies} }`);
function setup({ keep = false, max = 2 } = {}) {
    const History = make(keep, max, true, s => s);
    const history = new History();
    Object.assign(history, {
        clipItemsRadioGroup: [], writes: 0, redraws: 0, cleared: 0, deleted: [], notifications: [],
        registry: { deleteEntryFile: entry => history.deleted.push(entry) },
        _updateCache() { this.writes++; }, _showElements() { this.redraws++; },
        _clearClipboard() { this.cleared++; }, _showNotification(msg) { this.notifications.push(msg); },
        _addEntry(entry, selected) {
            const section = entry.isFavorite() ? this.favoritesSection : this.historySection;
            const item = { entry, currentlySelected: selected, destroyed: 0, destroy() { this.destroyed++; section.items.splice(section.items.indexOf(this), 1); } };
            section.items.unshift(item);
            this.clipItemsRadioGroup.push(item);
            this._showElements();
            return item;
        },
    });
    const section = () => ({ items: [], _getMenuItems() { return this.items.slice(); },
        moveMenuItem(item, index) { this.items.splice(this.items.indexOf(item), 1); this.items.splice(index, 0, item); } });
    history.historySection = section(); history.favoritesSection = section();
    history.add = (favorite = false, selected = false, image = false) => history._addEntry({
        favorite, isFavorite() { return this.favorite; }, isImage: () => image,
    }, selected);
    history.reset = () => { history.writes = history.redraws = 0; };
    return history;
}
{
    const h = setup(); const item = h.add(false, true, true); h.reset();
    h._removeEntry(item, 'delete'); h._removeEntry(item, 'delete');
    assert.equal(h.clipItemsRadioGroup.length, 0); assert.equal(h.writes, 1);
    assert.equal(h.redraws, 1); assert.equal(item.destroyed, 1); assert.equal(h.cleared, 1);
    assert.deepEqual(h.deleted, [item.entry]);
}
for (const keep of [false, true]) {
    const h = setup({ keep }); const pinned = h.add(true); const selected = h.add(false, true);
    for (let i = 0; i < 10000; i++) h.add(false, false, i === 5);
    const group = h.clipItemsRadioGroup; h.reset(); h._clearHistory();
    assert.strictEqual(group, h.clipItemsRadioGroup);
    assert.deepEqual(group, keep ? [pinned, selected] : [pinned]);
    assert.equal(h.writes, 1); assert.equal(h.redraws, 1); assert.equal(h.deleted.length, 1);
    assert.equal(h.cleared, keep ? 0 : 1); assert.equal(h.notifications.length, 1);
    h.reset(); h._clearHistory(true); assert.equal(h.writes, 0);
}
{
    const h = setup(); const old = h.add(); const pinned = h.add(true); const selected = h.add(false, true); const newest = h.add();
    h.reset(); h._removeOldestEntries(); assert.deepEqual(h.clipItemsRadioGroup, [pinned, selected, newest]);
    assert.equal(old.destroyed, 1); assert.equal(h.writes, 1); assert.equal(h.redraws, 1);
}
{
    const h = setup({ max: 0 }); h.add(); const pin = h.add(true); h.add();
    h._removeOldestEntries(); assert.deepEqual(h.clipItemsRadioGroup, [pin]);
}
{
    const h = setup(); const image = h.add(false, true, true); const other = h.add(); h.reset();
    h._moveItemFirst(image); assert.equal(h.writes, 1); assert.equal(h.redraws, 1);
    assert.equal(h.deleted.length, 0); assert.equal(h.clipItemsRadioGroup[0], other);
    assert.equal(h.clipItemsRadioGroup[1].entry, image.entry);
    assert.equal(h.clipItemsRadioGroup[1].currentlySelected, true);
    assert.strictEqual(h.clipItemsRadioGroup[1], image); assert.equal(image.destroyed, 0);
    h.reset(); h._moveItemFirst(image); assert.equal(h.writes, 0);
}
{
    const h = setup(); let item = h.add(false, true, true); const entry = item.entry;
    for (const favorite of [true, false]) {
        h.reset(); h._favoriteToggle(item);
        assert.equal(h.writes, 1); assert.equal(h.redraws, 1); assert.equal(h.deleted.length, 0);
        assert.equal(entry.isFavorite(), favorite); assert.equal(item.destroyed, 1);
        item = h.clipItemsRadioGroup[0]; assert.strictEqual(item.entry, entry);
        assert.equal(item.currentlySelected, true);
        assert.deepEqual((favorite ? h.favoritesSection : h.historySection).items, [item]);
    }
}
for (const destroyed of ['item', 'extension']) {
    const h = setup(); let imageDestroyed = 0;
    const image = { destroy() { imageDestroyed++; } };
    h.registry.getEntryAsImage = () => Promise.resolve(image);
    const item = { entry: { isText: () => false, isImage: () => true } };
    h._setEntryLabel(item);
    if (destroyed === 'item') item._clipboardDestroyed = true;
    else h._destroyed = true;
    await Promise.resolve();
    assert.equal(imageDestroyed, 1, 'late callback must dispose image without accessing dead actors');
}
console.log('History: 9 scenarios passed (actual extension methods, mocked Shell actors).');
