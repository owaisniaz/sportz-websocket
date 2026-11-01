import drizzleOrm from 'drizzle-orm';
const {
    and,
    asc,
    desc,
    eq,
    ne,
    gt,
    gte,
    lt,
    lte,
    inArray,
    count,
    getTableColumns,
} = drizzleOrm;

// Whitelist of operators the client may use: ?price[gte]=100
const OPERATORS = { eq, ne, gt, gte, lt, lte };
const RESERVED_FIELDS = ['page', 'sort', 'limit', 'fields'];

class ApiFeatures {
    /**
     * @param {object} db           drizzle instance
     * @param {object} table        drizzle table (pgTable)
     * @param {object} queryString  parsed req.query
     * @param {object} [options]
     * @param {string[]} [options.hiddenColumns] columns never exposed (e.g. ['password'])
     * @param {number}   [options.defaultLimit]
     * @param {number}   [options.maxLimit]
     */
    constructor(db, table, queryString, options = {}) {
        this.db = db;
        this.table = table;
        this.queryString = queryString || {};

        this.hiddenColumns = options.hiddenColumns || [];
        this.defaultLimit = options.defaultLimit || 100;
        this.maxLimit = options.maxLimit || 100;

        // Only columns that really exist and are not hidden can be filtered/sorted/selected
        this.columns = Object.fromEntries(
            Object.entries(getTableColumns(table)).filter(
                ([name]) => !this.hiddenColumns.includes(name)
            )
        );

        this.conditions = [];
        this.orderByClauses = [];
        this.selection = { ...this.columns };
        this.limitValue = this.defaultLimit;
        this.offsetValue = 0;
    }

    // Query-string values are always strings; convert them to what the column expects
    static coerce(name, column, value) {
        switch (column.dataType) {
            case 'number':
                if (Number.isNaN(Number(value))) {
                    throw ApiFeatures.badRequest(`Invalid number for "${name}"`);
                }
                return Number(value);
            case 'boolean':
                return value === 'true' || value === '1' || value === true;
            case 'date': {
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) {
                    throw ApiFeatures.badRequest(`Invalid date for "${name}"`);
                }
                return date;
            }
            default:
                return value;
        }
    }

    static badRequest(message) {
        const err = new Error(message);
        err.statusCode = 400;
        return err;
    }

    filter() {
        for (const [key, value] of Object.entries(this.queryString)) {
            if (RESERVED_FIELDS.includes(key)) continue;

            const column = this.columns[key];
            if (!column) continue; // ignore unknown / hidden columns

            // ?price[gte]=100&price[lt]=500  ->  { price: { gte: '100', lt: '500' } }
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                for (const [op, v] of Object.entries(value)) {
                    const fn = OPERATORS[op];
                    if (!fn) continue;
                    this.conditions.push(fn(column, ApiFeatures.coerce(key, column, v)));
                }
            }
            // ?status=active&status=pending  ->  IN (...)
            else if (Array.isArray(value)) {
                this.conditions.push(
                    inArray(column, value.map(v => ApiFeatures.coerce(key, column, v)))
                );
            }
            // ?name=John
            else {
                this.conditions.push(eq(column, ApiFeatures.coerce(key, column, value)));
            }
        }
        return this;
    }

    sort() {
        if (this.queryString.sort) {
            for (const field of String(this.queryString.sort).split(',')) {
                const isDesc = field.startsWith('-');
                const column = this.columns[isDesc ? field.slice(1) : field];
                if (column) this.orderByClauses.push(isDesc ? desc(column) : asc(column));
            }
        }

        // Default ordering (also keeps pagination stable)
        if (this.orderByClauses.length === 0) {
            const fallback = this.columns.createdAt || this.columns.id;
            if (fallback) this.orderByClauses.push(desc(fallback));
        }
        return this;
    }

    limitFields() {
        if (this.queryString.fields) {
            const picked = {};
            for (const name of String(this.queryString.fields).split(',')) {
                if (this.columns[name]) picked[name] = this.columns[name];
            }
            if (Object.keys(picked).length > 0) this.selection = picked;
        }
        return this;
    }

    paginate() {
        const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
        const limit = Math.min(
            Math.max(parseInt(this.queryString.limit, 10) || this.defaultLimit, 1),
            this.maxLimit
        );
        this.limitValue = limit;
        this.offsetValue = (page - 1) * limit;
        return this;
    }

    get where() {
        return this.conditions.length ? and(...this.conditions) : undefined;
    }

    // Builds the final drizzle query (thenable, so `await` runs it)
    build() {
        let query = this.db.select(this.selection).from(this.table).where(this.where);

        if (this.orderByClauses.length) query = query.orderBy(...this.orderByClauses);

        return query.limit(this.limitValue).offset(this.offsetValue);
    }

    async execute() {
        return this.build();
    }

    // Total rows matching the filters (ignores pagination) - handy for meta info
    async total() {
        const [row] = await this.db
            .select({ total: count() })
            .from(this.table)
            .where(this.where);
        return row.total;
    }
}

module.exports = ApiFeatures;

/* ------------------------------------------------------------------
Usage in a controller:

const ApiFeatures = require('../utils/apiFeatures');
const { db } = require('../db');
const { tours } = require('../db/schema');

exports.getAllTours = async (req, res, next) => {
  try {
    const features = new ApiFeatures(db, tours, req.query, {
      hiddenColumns: ['internalNotes'],
    })
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const [data, total] = await Promise.all([features.execute(), features.total()]);

    res.status(200).json({
      status: 'success',
      results: data.length,
      total,
      data: { tours: data },
    });
  } catch (err) {
    next(err);
  }
};

Example request:
GET /api/tours?price[gte]=100&price[lt]=500&sort=-price,name&fields=id,name,price&page=2&limit=10
------------------------------------------------------------------- */