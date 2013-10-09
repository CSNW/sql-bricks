var fs = require('fs');
var _ = require('underscore');

var comment = '// ';
var readme = fs.readFileSync(__dirname + '/../readme.md', 'utf8');
var contents = '';
readme.match(/```javascript[^`]+```/g).forEach(function(ex) {
  ex = ex.slice('```javascript'.length, -'```'.length);
  var lines = _.compact(ex.split('\n'));
  lines.forEach(function(line, ix) {
    line = line.trim();
    var next_line = (lines[ix + 1] || '').trim();

    if (isComment(line) && !isComment(next_line)) {
      var expected = getExpected(lines, ix);
      var code = wrap(lines.slice(0, ix));
      var last_line = desc = code[code.length - 1].trim();
      if (last_line.slice(-1) == ';')
        last_line = last_line.slice(0, -1);

      if (expected[0] != '{')
        expected = '"' + expected.replace(/"/g, '\\"') + '"';
      code[code.length - 1] = 'check(' + last_line + ', ' + expected + ');';
      
      
      //it(code.join('\n'), function(code, expected) {
        contents += 'it("' + desc.replace(/"/g, '\\"') + '", function() {';
        contents += code.join('\n') + '\n';
        contents += '});\n\n';
        // var result = eval(wrap(code));
        // if (result instanceof sql.Statement)
        //   assert.equal(result.toString(), expected);
        // else
        //   assert.deepEqual(result, JSON.parse(expected));
      //}.bind(null, code, expected));
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
