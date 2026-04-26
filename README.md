# Review Agency Starter Website

Ein einfacher, serioeser Onepager fuer eine Agentur mit Kundenformular auf Basis von Formspree.

## Dateien

- `index.html`: Struktur, Inhalte und Formular
- `styles.css`: Responsives Design
- `script.js`: Asynchrones Formular-Submit mit Statusmeldungen

## Formspree einrichten

1. In Formspree ein neues Formular erstellen.
2. Die Endpoint-URL kopieren: im Formular unter **Integration** (HTML-Einbindung) steht `action="https://formspree.io/f/…"` – genau diese URL verwenden, nicht die Redirect-URL aus den Einstellungen.
3. In `index.html` beim Formular (`action`) eintragen, z. B. `https://formspree.io/f/abcxyz12`.

Wenn beim Absenden **„Form not found“** erscheint, ist die `action`-URL falsch, veraltet oder das Formular wurde in Formspree geloescht – neue URL aus dem Dashboard holen.

## Lokal starten

Direkt als statische Seite:

1. `index.html` im Browser oeffnen
2. oder mit einem lokalen Server starten, z. B.:
   - `python3 -m http.server 5500`
   - dann `http://localhost:5500/review-agency-starter/` oeffnen

## Naechste sinnvolle Schritte

- Eigene Brandfarben, Logo und echte Kontaktdaten einfuegen
- Optional separaten geschuetzten Kundenbereich spaeter aufbauen (z. B. mit Login)
- DSGVO-Impressum/Datenschutzseiten ergaenzen
