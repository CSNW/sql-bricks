var assert = require('assert');
var fs = require('fs');
var _ = require('underscore');
var sql = require('./sql-bricks.js');
var select = sql.select, insertInto = sql.insertInto, insert = sql.insert,
  update = sql.update, del = sql.delete, replace = sql.replace;
var and = sql.and, or = sql.or, like = sql.like, not = sql.not, $in = sql.in,
  isNull = sql.isNull, isNotNull = sql.isNotNull, equal = sql.equal,
  lt = sql.lt, lte = sql.lte, gt = sql.gt, gte = sql.gte, between = sql.between;

var alias_expansions = {'usr': 'user', 'psn': 'person', 'addr': 'address'};
var table_to_alias = _.invert(alias_expansions);
sql.aliasExpansions(alias_expansions);

sql.joinCriteria = function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + table_to_alias[right_tbl] + '_fk'] = right_alias + '.pk';
  return criteria;
};

describe('SQL Bricks', function() {
  describe('documentation examples', function() {
    var comment = '// ';

    var readme = fs.readFileSync('readme.md', 'utf8');
    readme.match(/```javascript[^`]+```/g).forEach(function(ex) {
      ex = ex.slice('```javascript'.length, -'```'.length);
      var lines = _.compact(ex.split('\n'));
      lines.forEach(function(line, ix) {
        line = line.trim();
        var next_line = (lines[ix + 1] || '').trim();

        if (isComment(line) && !isComment(next_line)) {
          var expected = getExpected(lines, ix);
          var code = lines.slice(0, ix);
          
          it(code.join('\n'), function(code, expected) {
            var result = eval(wrap(code));
            if (result instanceof sql.Statement)
              assert.equal(result.toString(), expected);
            else
              assert.deepEqual(result, JSON.parse(expected));
          }.bind(null, code, expected));
        }
      });
    });

    function wrap(lines) {
      var last_line = lines[lines.length - 1];
      var match = /var (\w+) =/.exec(last_line);
      if (match)
        lines.push(match[1] + ';');

      return lines.join('\n');
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
  });
});

function check(stmt, expected) {
  assert.equal(stmt.toString(), expected);
}

function checkParams(stmt, expectedSQL, expectedValues) {
  var result = stmt.toParams();
  assert.equal(result.text, expectedSQL);
  assert.deepEqual(result.values, expectedValues);
}
