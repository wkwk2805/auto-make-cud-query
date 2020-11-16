const { Client } = require("pg");
const fs = require('fs');

const AutoMakeQuery = async ({user, host, database, password, port}) => {
    
    const connectDatabase = async (Client, param) => {
        const client = new Client(param);
        await client.connect();
        return client;
    }

    const getTableAndColumnName = async (client, database) => {
        const result = await client.query(`
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
        return result.rows.map(e => ({tname:e.tname, cname:JSON.parse(e.cname), pk:e.pk}));
    }

    const getInsertQuerys = (tableAndColumnName) => {
        let insertQuerys = '';
        for(let data of tableAndColumnName){
            const insertColumn = data.cname.join(',');
            const columnData = data.cname.map(e=>':'+e).join(',');
            const insertQuery = `INSERT INTO ${data.tname} (${insertColumn}) VALUES (${columnData})`;
            insertQuerys += insertQuery
            insertQuerys += '\n-------------------------------------------------------------\n'
        }
        return insertQuerys;
    };

    const getUpdateQuerys = (tableAndColumnName) => {
        let updateQuerys = '';
        for(let data of tableAndColumnName){
            const updateColumn = data.cname.filter(e => e !== data.pk).map(e => `${e} = :${e}`);
            const upd = `UPDATE ${data.tname} SET ${updateColumn} WHERE ${data.pk} = :${data.pk}`
            updateQuerys += upd;
            updateQuerys += '\n-------------------------------------------------------------\n'
        }
        return updateQuerys;
    }

    const getDeleteQuerys = (tableAndColumnName) => {
        let deleteQuerys = '';
        for(let data of tableAndColumnName){
            const deleteQuery = `DELETE FROM ${data.tname} WHERE ${data.pk} = :${data.pk}`;
            deleteQuerys += deleteQuery;
            deleteQuerys += '\n-------------------------------------------------------------\n'
        }
        return deleteQuerys;
    }

    const makeFile = (resultQuery) => {
        fs.writeFileSync(__dirname+'/cud.sql',resultQuery);
    }
    
    const param = {user, host, database, password, port};
    const client = await connectDatabase(Client, param);
    const tableAndColumnName = await getTableAndColumnName(client, database);
    const insertQuerys = getInsertQuerys(tableAndColumnName);
    const updateQuerys = getUpdateQuerys(tableAndColumnName);
    const deleteQuerys = getDeleteQuerys(tableAndColumnName);
    makeFile(insertQuerys+updateQuerys+deleteQuerys);
}

const param = {
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "test",
    port: 5432,
};

AutoMakeQuery(param);




