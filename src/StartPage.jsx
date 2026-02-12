import React from 'react';
import { Classes } from '@blueprintjs/core';

import './StartPage.css';

const StartPage = props => {
  return (
    <div>
      <div id="logo">
        <img src="http://www.litespread.com/img/logo.svg" id="logo" alt="" />
        <div>
          <h1 className={Classes.HEADING}>Litespread</h1>
          <strong>Tabular data in your browser</strong>
        </div>
      </div>

      <br />

      <p>Screenshot</p>
      <ul>
        <li>
          <p>Work with CSVs and sqlite3 databases</p>
          <ul>
            <li>Load from disk or URL</li>
            <li>Automatic import</li>
            <li>Export CSV or sqlite3</li>
          </ul>
        </li>
        <li>
          <p>Runs in the browser</p>
          <ul>
            <li>No installation necessary</li>
            <li>Works both online and offline</li>
            <li>Sync data via Remote Storage</li>
          </ul>
        </li>
        <li>
          <p>Basic spreadsheet functionaly</p>
          <ul>
            <li>Apply formatting to columns</li>
            <li>Add new formula columns</li>
            <li>Use aggregates to build a footer</li>
          </ul>
        </li>
        <li>
          <p>Built on SQL</p>
          <ul>
            <li>Build custom views using SQL</li>
            <li>Use SQL syntax in formulas</li>
            <li>
              Other applications can do INSERTs, UPDATEs and DELETEs and SELECT
              on all litespread data
            </li>
          </ul>
        </li>
      </ul>
      <h2 id="try-litespread-now">Try Litespread now</h2>
      <ul>
        <li>Simple Litespread example file</li>
        <li>Complex Litespread feature showcase</li>
        <li>Interesting CSV loaded directly from URL</li>
      </ul>
    </div>
  );
};

export default StartPage;
