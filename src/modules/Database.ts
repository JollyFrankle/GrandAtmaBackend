import mysql from 'mysql2/promise';

const mysql_config: mysql.PoolOptions = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    waitForConnections: true,
    connectionLimit: 2,
}

const pool = mysql.createPool(mysql_config);

export enum OnDuplicate {
    DoNothing,
    Update,
    Ignore
}

(() => {
    setInterval(async () => {
        try {
            pool.query("SELECT 1")
        } catch (e: any) {
            if (e.code === 'PROTOCOL_CONNECTION_LOST') {
                await pool.end()
                mysql.createPool(mysql_config)
            }
        }
    }, 5000)
})();

export async function query<T=any>(sql: string, params: any[] = []) {
    let [rows, _] = await pool.execute(sql, params);
    return rows as T[]
}

export async function insert(tableName: string, dataObject: any, onDuplicateRule = OnDuplicate.DoNothing) {
    let sql = `INSERT INTO ${tableName} (${Object.keys(dataObject).join(', ')}) VALUES (${Object.keys(dataObject).map(() => '?').join(', ')}) `;
    if (onDuplicateRule === OnDuplicate.Update) {
        sql += `ON DUPLICATE KEY UPDATE ${Object.keys(dataObject).map((key) => `${key} = VALUES(${key})`).join(', ')}`;
    } else if (onDuplicateRule === OnDuplicate.Ignore) {
        let firstKey = Object.keys(dataObject)[0];
        sql += `ON DUPLICATE KEY UPDATE ${firstKey} = ${firstKey}`;
    } // else do nothing

    let params = Object.values(dataObject);
    let [rows, _] = await pool.execute(sql, params);

    return rows
}

export async function update(tableName: string, dataObject: any, whereObject: any) {
    let sql = `UPDATE ${tableName} SET ${Object.keys(dataObject).map((key) => `${key} = ?`).join(', ')} WHERE ${Object.keys(whereObject).map((key) => `${key} = ?`).join(' AND ')}`;
    let params = [...Object.values(dataObject), ...Object.values(whereObject)];
    let [rows, _] = await pool.execute(sql, params);

    return rows
}

export default query