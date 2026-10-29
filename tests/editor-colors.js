import Gio from 'gi://Gio';

// Exercise the actual dialog callbacks without opening or modifying a Shell session.
const file = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('extension.js');
const [, bytes] = file.load_contents(null);
const source = new TextDecoder().decode(bytes);
const start = source.indexOf('    #showEditDialog (');
const end = source.indexOf('    #closeImagePreview ()', start);
if (start < 0 || end < 0) throw new Error('Editor dialog not found');
const body = source.slice(start, end).trim().replaceAll('#', '_');
function assert(ok, message) { if (!ok) throw new Error(message); }
let editor, dialog;
class Text {
    constructor(text) { this.text = text; }
    get_text() { return this.text; }
    grab_key_focus() {}
    set color(_) { throw new Error('Text color must come from the theme'); }
    set selection_color(_) { throw new Error('Selection color must come from the theme'); }
    set selected_text_color(_) { throw new Error('Selected text color must come from the theme'); }
}
class Widget {
    constructor(properties) { this.properties = properties; this.children = []; }
    add_child(child) { this.children.push(child); }
}
class Entry extends Widget {
    constructor(properties) { super(properties); this.clutter_text = new Text(properties.text); editor = this; }
}
class Dialog {
    constructor() { this.contentLayout = new Widget(); this.buttons = []; dialog = this; }
    addButton(button) { this.buttons.push(button); }
    open() { this.opened = true; }
    close() { this.closed = true; }
}
const show = new Function('St', 'ModalDialog', 'Clutter', '_', `return function ${body};`)(
    { Entry, ScrollView: Widget, BoxLayout: Widget, PolicyType: { NEVER: 0, AUTOMATIC: 1 } },
    { ModalDialog: Dialog }, { KEY_Escape: 27 }, text => text);
for (const selected of [false, true]) {
    let value = 'original\nsecond line';
    const item = { entry: { getStringValue: () => value, setText: text => { value = text; } }, currentlySelected: selected };
    const owner = { writes: 0, clipboardUpdates: 0, labels: 0, menu: { close() {}, open() {} },
        _updateCache() { this.writes++; }, _setEntryLabel() { this.labels++; },
        _updateClipboard() { this.clipboardUpdates++; } };
    show.call(owner, item);
    assert(dialog.opened, 'dialog did not open');
    assert(editor.clutter_text.get_text() === value, 'initial multiline text lost');
    assert(editor.clutter_text.single_line_mode === false && editor.clutter_text.line_wrap, 'multiline editing disabled');
    editor.clutter_text.text = 'changed\ntext';
    dialog.buttons.find(button => button.label === 'Discard').action();
    assert(value === 'original\nsecond line' && owner.writes === 0, 'discard changed data');
    show.call(owner, item);
    editor.clutter_text.text = 'saved\ntext';
    dialog.buttons.find(button => button.label === 'Save').action();
    assert(value === 'saved\ntext' && item.clipContents === value, 'save lost edited text');
    assert(owner.writes === 1 && owner.labels === 1, 'save must update label and registry once');
    assert(owner.clipboardUpdates === Number(selected), 'only selected entry should update clipboard');
}
print('Editor: theme colors, multiline text, save/discard and selected clipboard updates passed (mocked Shell widgets).');
