// MacroDeckRunner: evaluates JSX handed over from MacroDeck and returns a JSON
// string the panel forwards into response.json. Wrapping eval in try/catch turns
// AE script errors into a structured { ok, error } instead of a silent failure.
//
// IMPORTANT: After Effects' ExtendScript engine has NO built-in `JSON` object,
// so we must NOT use JSON.stringify here — it throws "JSON is undefined" and the
// panel then receives an empty result ("Panel could not parse AE result"). The
// response JSON is therefore hand-built below.
function MacroDeckRunner(jsxCode) {
    function escapeJson(s) {
        s = String(s);
        s = s.replace(/\\/g, '\\\\');
        s = s.replace(/"/g, '\\"');
        s = s.replace(/[\r\n\t]+/g, ' ');
        return s;
    }
    try {
        eval(jsxCode);
        return '{"ok":true,"error":null}';
    } catch (e) {
        var msg = (e && e.toString) ? e.toString() : 'Unknown After Effects error';
        return '{"ok":false,"error":"' + escapeJson(msg) + '"}';
    }
}
