var fs = require('fs');
var _ = require('underscore');

var comment = '// ';
var readme = fs.readFileSync(__dirname + '/../index.html', 'utf8');
var contents = '';
readme.match(/<pre>[^<]+<\/pre>/g).forEach(function(ex) {
  ex = ex.slice('<pre>'.length, -'</pre>'.length);
  var lines = _.compact(ex.split('\n'));
  lines.forEach(function(line, ix) {
    line = line.trim();
    var next_line = (lines[ix + 1] || '').trim();

    if (isComment(line) && !isComment(next_line)) {
      var expected = getExpected(lines, ix);
      var code = wrap(lines.slice(0, ix));
      var last_line = desc = code[code.length - 1].replace(/\r/g, '');
      if (last_line.slice(-1) == ';')
        last_line = last_line.slice(0, -1);

      if (expected[0] != '{')
        expected = '"' + expected.replace(/"/g, '\\"') + '"';
      expected = expected.replace(/&lt;/g, '<');
      if (last_line[0] == ' ') {
        last_line = code[code.length - 2] + last_line;
        code[code.length - 2] = '';
      }
      
      code[code.length - 1] = 'check(' + last_line + ', ' + expected + ');';
      contents += 'it("' + desc.replace(/"/g, '\\"').trim() + '", function() {';
      contents += code.join('\n') + '\n';
      contents += '});\n\n';
    }
  });
});
var tmpl = fs.readFileSync(__dirname + '/doctests.tmpl', 'utf8');
fs.writeFileSync(__dirname + '/doctests.js', tmpl.replace('{{tests}}', contents));

function wrap(lines) {
  var last_line = lines[lines.length - 1];
  var match = /var (\w+) =/.exec(last_line);
  if (match)
    lines.push(match[1] + ';');
  lines = _.compact(lines);
  lines = _.reject(lines, isComment);
  return lines;
}
function isComment(str) {
  return str.slice(0, comment.length) == comment;
}
function trimComment(str) {
  return str.slice(comment.length);
}
function getExpected(lines, ix) {
  var comments = [];
  while (isComment(lines[ix])) {
    comments.push(trimComment(lines[ix]));
    ix--;
  }
  comments.reverse();
  comments = _.invoke(comments, 'trim');
  return comments.join(' ');
}
