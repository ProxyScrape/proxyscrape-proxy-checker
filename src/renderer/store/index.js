import mainReducer from './reducers/';
import { createStore, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import settingsPersistMiddleware from './settingsPersistMiddleware';

const store = createStore(
    mainReducer,
    applyMiddleware(thunkMiddleware, settingsPersistMiddleware)
);

export default store;
