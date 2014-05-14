# SQL Bricks.js

[![Build Status](https://travis-ci.org/CSNW/sql-bricks.png?branch=master)](https://travis-ci.org/CSNW/sql-bricks)

SQL Bricks.js is a transparent, schemaless library for building and composing SQL statements.

- Supports all SQL-92 clauses for select, insert, update & delete statements (plus some postgres & sqlite additions)
- Over [150 tests](http://csnw.github.io/sql-bricks/browser-tests.html)
- Easy-to-use, comprehensive [docs](http://csnw.github.io/sql-bricks)
- Single straightforward [source file](sql-bricks.js) (less than 1,000 lines), easy to understand & debug


Comparison with popular SQL-generation libraries:

library         | lines | files | schema       | language     | other notes  
--------------- | ----- | ----- | ------------ | --------     | --------------
[Knex][1]       | 3500  |    30 | schema       | javascript   | transactions, migrations, promises, connection pooling
[Squel][2]      | 1000  |     3 | schemaless   | coffeescript | 
[node-sql][3]   | 2600  |    59 | schema       | javascript   |
[mongo-sql][4]  | 1700  |    49 | schemaless   | javascript   | 
[gesundheit][5] | 1600  |    21 | schemaless   | coffeescript | uses Any-DB to wrap the DB driver
[sql-bricks][6] |  800  |     1 | schemaless   | javascript   |

[1]: https://github.com/tgriesser/knex
[2]: https://github.com/hiddentao/squel
[3]: https://github.com/brianc/node-sql
[4]: https://github.com/goodybag/mongo-sql
[5]: https://github.com/BetSmartMedia/gesundheit
[6]: https://github.com/tgriesser/knex

License: [MIT](LICENSE.md)

Documentation: http://csnw.github.io/sql-bricks
