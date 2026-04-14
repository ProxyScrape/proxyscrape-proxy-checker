import { INPUT_SET_LOADED_FILE_DATA, INPUT_CLEAR } from '../../constants/ActionTypes';

const initial = {
    loaded: false,
    list: [],
    errors: [],
    total: 0,
    unique: 0,
    name: '',
    size: 0,
    hasProtocols: false,
};

const input = (state = initial, action) => {
    switch (action.type) {
        case INPUT_SET_LOADED_FILE_DATA:
            return {
                ...state,
                ...action.nextState
            };
        case INPUT_CLEAR:
            return initial;
        default:
            return state;
    }
};

export default input;
