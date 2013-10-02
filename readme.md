# SQL-Bricks

SQL is a complicated, expressive DSL. SQL-Bricks is not an abstraction layer and makes no attempt to hide user from SQL syntax. On the contrary, it is designed to match SQL as faithfully as possible so that the experienced SQL user can easily guess the API. Soon, we hope to make it fully comprehensive, so that it supports all clauses of the four supported statements (SELECT/INSERT/UPDATE/DELETE).

SQL-Bricks provides easy parameter substitution, automatic quoting of columns that match SQL keywords ("order", "desc", etc), a nice chainable syntax so you don't have to wrangle massive multi-line strings, a few conveniences (user-supplied abbreviation support and auto join criteria support) and, most importantly, **easy composition and re-use of SQL**.

## Project Goals

SQL-Bricks was born out of frustration with other SQL-generation libraries (including one I wrote).

**Composable:** The primary goal of SQL-Bricks is to enable the elimination of DRY in SQL-heavy applications by allowing easy composition and modification of SQL statements, like building blocks. To enable this, statements can be cloned and clauses can be added in any order (if a WHERE clause already exists, the new one will be ANDed on to it):

```javascript
var stmt = select('*').from('user');
stmt.orderBy('last_name');
stmt.where({'first_name': 'Fred'});
stmt.where({'active': true});
// SELECT * FROM user WHERE first_name = 'Fred' AND active = true ORDER BY last_name
```

**Zero Configuration:** SQL-Bricks doesn't use or require a schema (though you can provide a set of abbreviations for convenience, see below).

**Match the SQL Language:** SQL-Bricks doesn't require memorizing a new, complex API -- if you know SQL, then the API should be guessable without needing to look up anything. The overriding idea is that SQL keywords are chainable camelCase methods, non-keywords are passed in as strings and WHERE/JOIN criteria can be expressed by literal objects:

```javascript
select('*').from('user').innerJoin('address').on({'user.addr_id': 'address.id'});
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
```

Since the method chain cannot express nested AND/OR groupings, SQL-Bricks uses nestable functions for WHERE criteria (`and()`, `or()`, `not()`, `like()`, `in()`, `isNull()`, `isNotNull()`, `eq()`, `lt()`, `lte()`, etc):

```javascript
select('*').from('user').where(or(like('last_name': 'Flint%'), {'first_name': 'Fred'}));
// SELECT * FROM user WHERE last_name LIKE 'Flint%' OR first_name = 'Fred'
```

As a convenience, you can chain .and(), since it is unambiguous, or pass multiple criteria to `.where()` in an object literal:

```javascript
select('*').from('user').where('last_name', 'Flintstone').and('first_name', 'Fred');
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
select('*').from('user').where({'last_name': 'Flintstone', 'first_name': 'Fred'});
// SELECT * FROM user WHERE last_name = 'Flintstone' AND first_name = 'Fred'
```

**User-Supplied Abbreviations and Join Criteria Functions for Higher Signal/Noise:** There are a variety of shortcuts available:
* shorter aliases (`.join()`, `.group()`, `.order()`, etc)
* select() defaults to '*'
* `.on()` criteria can be passed as an additional argument to `.join()`
* `.on()` criteria can be auto-generated via a helper function
* frequently-used table abbreviations can be set

```javascript
sql.setAbbrs({'usr': 'user', 'addr': 'address'});
sql.joinCriteria = function(left_tbl, left_alias, right_tbl, right_alias) {
  var criteria = {};
  criteria[left_alias + '.' + sql.getAbbr(right_tbl) + '_id'] = right_alias + '.id';
  return criteria;
};

select().from('usr').join('addr');
// SELECT * FROM user INNER JOIN address ON user.addr_id = address.id
```

**Pseudo-Views:** Another way that SQL-Bricks allows re-use is through pseudo-views. Perhaps this isn't as helpful for Postgres, where views are fast, but it is helpful for MySQL and SQLite, where views can introduce major performance problems unless they can be flattened (see the "Subquery Flattening" section of [the SQLite Query Planner](http://www.sqlite.org/optoverview.html)). SQL-Bricks allows the definition of a pseudo-view, consisting of a main tables and any number of joined tables along with optional where criteria. This can then be aliased and joined to (the view's join tables are prefixed with the view's alias):

```javascript
sql.defineView('localUser', 'user')
  .join('address').on({'user.addr_id': 'address.id'})
  .where({'address.local': true});

select('*').from('person')
  .join('localUser l_usr').on({'person.usr_id': 'user.id'});
// SELECT * FROM person
// INNER JOIN user l_usr ON person.usr_id = l_usr.id
// INNER JOIN address l_usr_address ON l_usr.addr_id = l_usr_address.id
// WHERE l_usr_address.local = true
```

There's not much benefit to using SQL-Bricks for ALTER TABLE statements, CREATE statements, etc, so we've restricted it to SELECT/INSERT/UPDATE/DELETE.

**Parameterized SQL:**

Calling `.toParams()` (as opposed to `.toString()`) will return an object with a `text` property that contains the SQL with `$1`, `$2`, etc, placeholders in it and a `values` property that contains an array of the values. Anything on the right-hand side of a `WHERE` criteria is assumed to be a value, as well as anything values passed into an `insert()` or `update()` statement:

```javascript
update('user').set('first_name', 'Fred').where('last_name', 'Flintstone').toParams();
// {'text': 'UPDATE user SET first_name = $1 WHERE last_name = $2, 'values': ['Fred', 'Flintstone']}

// alternate syntax
update('user', {'first_name': 'Fred'}).where({'last_name': 'Flintstone'}).toParams();
// {'text': 'UPDATE user SET first_name = $1 WHERE last_name = $2, 'values': ['Fred', 'Flintstone']}
```

# To-Do

Document the join criteria auto-generation in more detail, especially what `.join('tbl1', 'tbl2').join('tbl3')` does (and note that auto-generation of criteria for complex JOIN table layouts is not supported).

Add support for:

* .into()
* .join().on() / .using()
* .leftJoin / .rightJoin / .fullJoin / .crossJoin
* .union() / .intersect() / .except()
* .limit() / .offset()
* .fetch()
* .forUpdate() / .forShare()
* Allow more reuse by supporting .join()s for `UPDATE` and `DELETE` statements, implemented via `WHERE` criteria and placing the table name in the `FROM` and the `USING` clause, respectively.
* querying directly off of a pseudo-view: select().from(viewName)
* cloning statements
* SQLite support (server-side and client-side examples)
* Support for old browsers via polyfills
