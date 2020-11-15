const { Client } = require("pg");
const fs = require('fs');

const AutoMakeQuery = async (user, host, database, password, port) => {
    const client = new Client({
        user: user,
        host: host,
        database: database,
        password: password,
        port: port,
      });
    await client.connect();
    const tableWithDatabase = await client.query(`
        select  
            tname
            ,'['||ARRAY_TO_STRING(ARRAY_AGG('"'||cname||'"'),',')||']' cname
            ,max(pname) pk
        from (
            SELECT
                T.table_name tname
                ,case when T.column_default is not null then T.column_name||' /* default: '||T.column_default||'*/' 
                else T.column_name
                end cname
                ,T3.column_name pname
            FROM INFORMATION_SCHEMA.columns T
            JOIN PG_STAT_USER_TABLES T2 ON RELNAME = TABLE_NAME
            left join (
                select
                    table_name 
                    ,column_name
                from INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE 
                where constraint_name in (
                    select constraint_name 
                    from INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                    where constraint_type = 'PRIMARY KEY'
                )
            ) T3 on T.table_name = T3.table_name and T.column_name = T3.column_name
            WHERE TABLE_CATALOG = $1
        ) T
        group by tname
    `,[database]);
    const result = tableWithDatabase.rows;
    const jsonResult = result.map(e => ({tname:e.tname, cname:JSON.parse(e.cname), pk:e.pk}))
    let insertQuerys = '';
    let updateQuerys = '';
    let deleteQuerys = '';
    for(let data of jsonResult){
        const insertColumn = data.cname.join(',');
        const columnData = data.cname.map(e=>':'+e).join(',');
        const insertQuery = `INSERT INTO ${data.tname} (${insertColumn}) VALUES (${columnData})`;
        insertQuerys += insertQuery
        insertQuerys += '\n-------------------------------------------------------------\n'
        const updateColumn = data.cname.filter(e => e !== data.pk).map(e => `${e} = :${e}`);
        const upd = `UPDATE ${data.tname} SET ${updateColumn} WHERE ${data.pk} = :${data.pk}`
        updateQuerys += upd;
        updateQuerys += '\n-------------------------------------------------------------\n'
        const deleteQuery = `DELETE FROM ${data.tname} WHERE ${data.pk} = :${data.pk}`;
        deleteQuerys += deleteQuery;
        deleteQuerys += '\n-------------------------------------------------------------\n'
    }
    const resultQuery = insertQuerys+updateQuerys+deleteQuerys;
    fs.writeFileSync(__dirname+'/cud.sql',resultQuery);
}

AutoMakeQuery("postgres", "localhost", "postgres",'test', 5432);




