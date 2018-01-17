import React from 'react';
import ReactDataGrid from 'react-data-grid';


function entries(obj) {
    var ownProps = Object.keys(obj),
    i = ownProps.length,
    resArray = new Array(i);  // preallocate the Array
    while (i--)
        resArray[i] = [ownProps[i], obj[ownProps[i]]];

    return resArray;
};


var formatter_alignment = {
    'undefined': 'left',
    'money': 'right',
};


function CustomHeader(props) {
    const col = props.column;
    return (
        <div className="{col.cellClass}">{col.key}
            {col.formula && <div>= {col.formula}</div>}
        </div>
    );
}

class Table extends React.Component {

    constructor(props, context) {

        super(props, context);
        this._columns = [
        { key: 'id', name: 'ID' },
        { key: 'title', name: 'Title' },
        { key: 'count', name: 'Count' } ];

        this.state = {
            rows: [],
            columns: props.table.columns.map(col => ({
                key: col.name,
                name: col.name,
                cellClass: 'text-' + formatter_alignment[col.formatter || 'undefined'],
                editable: !col.formula,
                headerRenderer: CustomHeader,
                formula: col.formula,
            })),
            name: props.table.name
        };
    }

    componentWillMount() {
        if (this.props.db) {
            this.updateFromDb(this.props.db);
        }
    }

    updateFromDb(db) {
        var result = db.exec(`SELECT * FROM ${this.props.table.name}_formatted`);
        var rows = result[0].values.map(row => row);
        this.setState({
            rows: rows,
        });
    }

    handleGridRowsUpdated = ({ fromRow, toRow, updated }) => {
        var row_ids = [];
        for (let i = fromRow; i <= toRow; i++) {
            row_ids.push(this.state.rows[i][0]);
        }
        var set = entries(updated).map(
                item => `${item[0]} = '${item[1]}'`
            ).join(', ');
        this.props.db.exec(`
                UPDATE inventory
                SET ${set}
                WHERE _rowid_ IN (${row_ids.join(', ')})
        `);
        this.props.onChange();
    };

    rowGetter = (rowIndex) => {
        var row = {};
        this.state.rows[rowIndex].forEach(
            (value, i) => {
                if (i === 0) {
                    row.rowid = value
                } else {
                    row[this.state.columns[i - 1].key] = value;
                }
            }
        )
        return row;
    };

    componentWillReceiveProps = (nextProps) => {
        if (nextProps.last_db_change !== this.state.last_refresh) {
            this.updateFromDb(nextProps.db);
            this.setState({
                last_refresh: nextProps.last_db_change,
            });
        }
    }

    render() {
        return  (
                <ReactDataGrid
                columns={this.state.columns}
                rowGetter={this.rowGetter}
                rowsCount={this.state.rows.length}
                minHeight={500}
                onGridRowsUpdated={this.handleGridRowsUpdated}
                enableCellSelect={true}  // required for editable
                headerRowHeight={60}
                />);
    }
}


export default Table;
