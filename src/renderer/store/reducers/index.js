import { combineReducers } from 'redux';
import checking from './checking';
import input from './input';
import update from './update';
import result from './result';
import overlay from './overlay';
import core from './core';
import judges from './judges';
import ip from './ip';
import blacklist from './blacklist';
import main from './main';
import history from './history';
import ui from './ui';
import app from './app';

const mainReducer = combineReducers({
    checking,
    input,
    result,
    overlay,
    update,
    core,
    judges,
    ip,
    blacklist,
    main,
    history,
    ui,
    app,
});

export default mainReducer;
