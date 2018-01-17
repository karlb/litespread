import React from 'react';
import ReactDataGrid from 'react-data-grid';
import update from 'immutability-helper';

function entries(obj) {
    let ownProps = Object.keys(obj),
    i = ownProps.length,
    resArray = new Array(i);  // preallocate the Array
    while (i--)
        resArray[i] = [ownProps[i], obj[ownProps[i]]];

    return resArray;
};


let formatter_alignment = {
    'undefined': 'left',
    'money': 'right',
};


class EditableText extends React.Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            editing: false,
            value: props.children,
        };
    }

    onChange = (event) => {
        this.setState({value: event.target.value});
    }

    onChangeDone = (event) => {
        this.props.onChange(event.target.value);
    }

    render() {
        if (this.state.editing === true) {
            return <input
                autoFocus
                type="text"
                value={this.state.value}
                onChange={this.onChange}
                onBlur={(event) => {this.onChangeDone(event); this.setState({editing: false})}}
            />;
        } else {
            return <span onClick={() => this.setState({editing: true})}>{this.props.children}</span>;
        }
    }
}


function CustomHeader(props) {
    const col = props.column;
    return (
        <div className="{col.cellClass}">{col.key}
            {col.formula && <div>
                = <EditableText onChange={col.onFormulaChange}>{col.formula}</EditableText>
            </div>}
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
            columns: this.makeColumns(props),
            name: props.table.name,
        };
    }

    makeColumns(props) {
        return props.table.columns.map((col, colIndex) => ({
            key: col.name,
            name: col.name,
            cellClass: 'text-' + formatter_alignment[col.formatter || 'undefined'],
            editable: !col.formula,
            headerRenderer: CustomHeader,
            formula: col.formula,
            onFormulaChange: formula => {
                    let updateDesc = {columns: {}};
                    updateDesc.columns[colIndex] = {formula: {$set: formula}};
                    props.onSchemaChange(
                            update(props.table, updateDesc));
                },
        }))
    }

    componentWillMount() {
        if (this.props.db) {
            this.updateFromDb(this.props.db);
        }
    }

    updateFromDb(db) {
        let result = db.exec(`SELECT * FROM ${this.props.table.name}_formatted`);
        let rows = result[0].values.map(row => row);
        this.setState({
            rows: rows,
        });
    }

    handleGridRowsUpdated = ({ fromRow, toRow, updated }) => {
        let row_ids = [];
        for (let i = fromRow; i <= toRow; i++) {
            row_ids.push(this.state.rows[i][0]);
        }
        let set = entries(updated).map(
                item => `${item[0]} = '${item[1]}'`
            ).join(', ');
        this.props.db.exec(`
                UPDATE inventory
                SET ${set}
                WHERE _rowid_ IN (${row_ids.join(', ')})
        `);
        this.props.onDataChange();
    };

    rowGetter = (rowIndex) => {
        let row = {};
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
        this.setState({columns: this.makeColumns(nextProps)});
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
