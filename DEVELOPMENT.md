# Entwicklung und kontrollierter Test

Stand: 28. Oktober 2026. Noch **kein Test in der produktiven GNOME Shell**.

## Ausgangspunkt und Commits

Upstream: `https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator`.
Basis: `c880c7fb88dc7232a61a5864d125989a4f375daa` (aktueller Upstream-HEAD beim Klonen).
Die Programmdateien entsprechen v71; seit dem Tag gibt es keine Unterschiede im Git-Baum.
Fork: `https://github.com/gneiss15/gnome-shell-extension-clipboard-indicator`.
Branch: `codex/clipboard-history-optimizations`. `upstream` bleibt das Original,
`origin` zeigt auf den Fork. Kein Upstream-PR, keine Veröffentlichung auf extensions.gnome.org.
UUID, Schema, Lizenz und Copyright sind unverändert.

1. `8210d3e`: exakt der auf GN-Aorus vorhandene, erfolgreich erprobte Patch.
   SHA-256 der übernommenen `extension.js`:
   `067a08667a4a156c4066351f0813459147a783eef0cb5c2109eed706928313b3`.
   Die installierten übrigen JS-Dateien, Stylesheet und Lizenz entsprechen Upstream.
   Die installierte `metadata.json` enthält zusätzlich Paket-/Versionsangaben;
   sie wurde nicht über die Upstream-Metadaten kopiert.
2. `e05b11a`: Sammellöschung, einmalige Cache-/Menüaktualisierung, keine
   Bildlöschung beim Verschieben und Schutz gegen verspätete Menübild-Callbacks.
3. `1c8cbcd`: innerhalb derselben Menüsektion bestehenden Actor umordnen.
   Beim Pin/Unpin wird nur der betroffene Eintrag neu erzeugt, damit dessen
   Schaltflächen aktualisiert werden. Keine Zwischenstände werden gespeichert.
4. `77f1733`: serialisierte atomare Speicherung, Wiederholungen, Shutdown-Drain,
   verzögerte Bildbereinigung und Warten auf ausstehende Daten vor erneutem Lesen.
5. `2e7025f`: automatisierte Tests.

## Verhalten und Grenzen

`_removeEntries()` entfernt die gewählte Menge in einem Durchlauf aus der
Radiogruppe, erhält deren Array-Identität und zerstört nur die betroffenen Actors.
Favoriten werden bei Clear und Größenbegrenzung ausgespart. Die Clear-Einstellung
zum Erhalten der Auswahl, das Leeren des Clipboards beim Löschen der Auswahl und
Benachrichtigungen bleiben erhalten. Größenbegrenzung behält wie Upstream die
aktuelle Zwischenablage bei; sie entfernt die ältesten nicht angehefteten Einträge.
Pro Sammellöschung erfolgen höchstens eine Speicherung und eine Menüaktualisierung.
Ein schon an erster Stelle stehender Eintrag verursacht beim erneuten Verschieben
keine Speicherung.

Die Queue hält einen laufenden und einen ersetzbaren vorgemerkten Snapshot.
Snapshots enthalten kopierte JSON-Werte und unveränderliche Bildbytes, keine
Shell-Actors. Serialisierung erfolgt erst beim Schreiben. Derselbe Dateipfad
verwendet innerhalb des Prozesses auch nach Disable/Enable dieselbe Queue.
Bilder werden vor dem Registry-Commit gespeichert. Zu löschende Bilder werden
erst nach einem erfolgreichen Registry-Commit ohne diese Referenzen entfernt;
Fehler bei der Bildbereinigung werden protokolliert und beim nächsten Commit
erneut versucht. Bei einem Crash zwischen Commit und Bereinigung können
unreferenzierte Bilddateien zurückbleiben.

Schreibfehler werden protokolliert, der neueste Snapshot bleibt vorgemerkt.
Es gibt drei automatische Wiederholungen nach 250/500/1000 ms. Eine neue
Speicheranforderung ersetzt den vorgemerkten Stand und setzt das Fehlerbudget
zurück. Bei dauerhaftem Fehler bleibt der Stand im Speicher; erst eine weitere
Anforderung oder `flush()` startet einen neuen Versuch. Kein stilles Verwerfen
späterer Änderungen, keine unbegrenzte Wiederholungsschleife.

Beim Deaktivieren wird der laufende Vorgang fertiggestellt und ein letzter
Versuch für vorgemerkte Daten ausgeführt; Wiederholungstimer werden entfernt.
`destroy()` kann nicht warten: reine Datei-Callbacks dürfen anschließend
weiterlaufen, ohne Actors anzufassen. Ein erneutes Lesen wartet ebenfalls auf
die Queue und scheitert ausdrücklich, falls neuere Daten weiterhin ungespeichert
sind. Ein abrupter Prozessabbruch kann noch nicht gespeicherte Änderungen verlieren;
ein synchrones Blockieren der Shell wird bewusst vermieden.

### Atomarität

Der bisherige `replace_async()`-Stream verwendet für lokale Dateien bereits
sichere Dateiersetzung. Allerdings wurde die Anzahl tatsächlich geschriebener
Bytes nicht geprüft und Fehler beim Öffnen, Schreiben oder Schließen wurden
nicht kontrolliert behandelt. Nun übernimmt `replace_contents_bytes_async()`
mit `replace_contents_finish()` vollständiges Schreiben und Abschluss in einer
Operation. Der lokale Gio-Backend verwendet temporäre Dateien und atomare
Umbenennung: Leser sehen den alten oder neuen vollständigen Registry-Stand.
Gio hält die GBytes bis zum Abschluss fest. Neue Dateien werden privat angelegt.

Referenzen:
- https://docs.gtk.org/gio/method.File.replace.html
- https://docs.gtk.org/gio/method.File.replace_contents.html
- https://docs.gtk.org/gio/method.File.replace_contents_bytes_async.html

Diese Garantie bezieht sich auf reguläre Dateien im lokalen Cache und den
entsprechenden Gio-Backend. Sie ist keine Zusicherung gegen Hardwarefehler,
alle Netzdateisysteme oder Stromausfall ohne dauerhafte Speicherung. Ein abrupt
beendeter Vorgang kann temporäre Dateien hinterlassen. Schreibkoordination ist
zusätzlich nötig: atomare Ersetzung allein verhindert kein Überschreiben durch
ältere parallele Aufträge.

### Signal-/GC-Untersuchung

GNOME Shell 46s lokal vorhandene `PopupMenuBase.moveMenuItem()` kann vorhandene
Actors innerhalb einer Sektion verschieben. Dadurch entfallen Destroy und die
Neuregistrierung der Signal-Handler beim normalen Verschieben. Menüeinträge
tragen einen expliziten Destroy-Marker; ein verspäteter Bild-Callback verwirft
sein Bild, statt einen bereits zerstörten Menüeintrag zu verwenden.

Die meisten Eintragssignale hängen am Actor oder seinen Kind-Buttons und werden
bei explizitem Destroy vom GObject-Lebenszyklus abgeräumt. Die Extension trennt
Settings- und Selection-Signale bereits explizit. Weiterhin gibt es unter anderem
asynchrone Topbar-Bilder, Dialoge und Preview-Signale im Upstream-Code. Deren
vollständige Lebenszyklusprüfung und eine GC-Reproduktion stehen aus.
**Es ist nicht nachgewiesen, dass die Warnung „Attempting to call back into JSAPI
during the sweeping phase of GC“ behoben ist.**

## Automatisierte Prüfung

Voraussetzungen: Node.js 20+, GJS, Gio/GLib und für den Registry-Roundtrip die
installierten GNOME-Shell-46-/Mutter-14-Typelibs. Keine Paketinstallation nötig
auf dem geprüften Ubuntu-24.04-System.

Im separaten Klon ausführen:

```bash
node tests/history.mjs
node tests/queue.mjs
gjs -m tests/storage.js
GI_TYPELIB_PATH=/usr/lib/gnome-shell:/usr/lib/x86_64-linux-gnu/mutter-14 gjs -m tests/registry.js
git diff --check
```

Alle Prüfungen bestanden am 28. Oktober 2026:

- History: 8 Szenarien mit tatsächlichen aus `extension.js` geladenen Methoden
  und simulierten Shell-Actors: Hinzufügen/Entfernen, doppelte Entfernung,
  10.000 Einträge löschen, Favoriten/Auswahl, leerer Clear, Größenbegrenzung
  einschließlich Null, Verschieben ohne Actor-Zerstörung, Pin/Unpin von Bildern.
- Queue: 5 Szenarien, darunter 10.000 Anforderungen während eines aktiven Writes,
  höchstens ein aktiver Writer, nur neuester vorgemerkter Stand, Fehler/Retry,
  ausgeschöpftes Fehlerbudget, Wiederherstellung und Shutdown mit neuer Anforderung.
- Storage: echte Gio-Zugriffe, 1.000 Anforderungen, gültiges Unicode-JSON,
  konkurrierende Leser während großer Dateiersetzungen, Abbruch eines Vorgangs,
  gemeinsame Queue, Bild-vor-Registry-Reihenfolge und verzögerte Bildlöschung,
  Schreibfehler durch blockierten Verzeichnispfad und anschließende Erholung.
- Registry: tatsächliche `Registry`/`ClipboardEntry`-Roundtrips für Hinzufügen,
  Entfernen, Tags/Favoriten, neue Instanz bei ausstehendem Write, veränderliche
  Einträge bei 1.000 Anforderungen und leeren Verlauf.

Dateitests erzeugen ausschließlich neue `/tmp/clipboard-*-test-*`-Verzeichnisse
und melden deren Pfade. Testartefakte bleiben zur Prüfung erhalten. Bei Bedarf
mit `gio trash <gemeldeter-Pfad>` in den Papierkorb verschieben. Es werden weder
Produktivdaten gelesen noch verändert. Keine Aussage über Bilddarstellung,
Fokus, tatsächliche GNOME-Signale oder wahrgenommene Shell-Performance ohne
nachfolgenden interaktiven Test.

## Späterer kontrollierter Test auf GN-Aorus — noch nicht ausgeführt

Die folgenden Schritte sind eine Anleitung für einen später separat freizugebenden
Produktivtest. Kein `make install` verwenden: das Upstream-Ziel entfernt zuerst
die bestehende Installation. Kein automatischer Shell-Neustart.

1. Im separaten Klon obige Tests erneut prüfen. Neue JS-Dateien `writeQueue.js`
   und `registryStorage.js` müssen im Testpaket enthalten sein (`*.js` im Makefile).
   Schema ausschließlich im Arbeitsverzeichnis kompilieren:
   `glib-compile-schemas --strict schemas`. UUID und Schema bleiben identisch.
2. Vorher privaten Backup-Ordner mit Zeitstempel anlegen. Die **vollständige**
   installierte Extension und den **vollständigen Cache-Ordner inklusive aller
   Bilder** sowie einen Export von
   `dconf dump /org/gnome/shell/extensions/clipboard-indicator/` dort sichern.
   Backup nicht veröffentlichen: es enthält Clipboard-Inhalte. Zum Sichern der
   Quelldateien kann die Extension weiterlaufen; für eine konsistente abschließende
   Cache-Sicherung muss sie anschließend gezielt deaktiviert werden.
3. Erst nach Freigabe die Extension deaktivieren, ausstehende Dateizugriffe
   auslaufen lassen und Cache erneut in einen separaten Backup-Unterordner
   kopieren. Anschließend ein vorbereitetes Testpaket mit allen benötigten
   JS-Dateien, Metadaten, Stylesheet, Schema und Sprachdateien bereitstellen.
   Die alte Extension mit `gio trash` verschieben, dann das Paket am bisherigen
   Pfad einsetzen. Den Cache nicht vorab löschen oder konvertieren.
4. Extension aktivieren. Wenn Shell alte Module weiterverwendet, einen normalen
   Ab-/Anmeldevorgang für den kontrollierten Test einplanen. Kein automatisches
   `Alt+F2 r` oder erzwungener Shell-Neustart.
5. Mit entbehrlichen Texten/Bildern prüfen: Favoriten, beide Clear-Auswahlmodi,
   Clear bei großem Verlauf, Größenlimit reduzieren, Verschieben, Pin/Unpin,
   erneutes Aktivieren und Wiederherstellung nach Anmeldung. Einstellungen für
   automatisches Clear zuvor prüfen. Löschen großer Verläufe nur auf einer
   ausdrücklich dafür freigegebenen Kopie der Clipboard-Daten testen.
6. `journalctl --user -b` auf Registry-Fehler und die genannte GC-Warnung prüfen.
   Alle Änderungen vollständig auslaufen lassen. JSON nur bei deaktivierter
   Extension prüfen; Clipboard-Inhalte nicht in öffentliche Logs kopieren.

### Rückkehr zur bisherigen Version

Extension deaktivieren und Dateivorgänge auslaufen lassen. Testinstallation mit
`gio trash` verschieben und den gesicherten vollständigen Extension-Ordner an den
ursprünglichen Pfad zurückkopieren. Falls auch Clipboard-Daten zurückgesetzt
werden sollen, zuerst den Testcache mit `gio trash` sichern und anschließend den
kompletten konsistenten Cache-Backup samt Bildern zurückkopieren. Falls während
des Tests Einstellungen verändert wurden, den gesicherten dconf-Export mit
`dconf load /org/gnome/shell/extensions/clipboard-indicator/` zurückspielen.
Danach regulär anmelden beziehungsweise die bisherige Extension aktivieren.
Backups erst nach erfolgreicher Prüfung über den Papierkorb aufräumen.
