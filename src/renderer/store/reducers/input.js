import { INPUT_SET_LOADED_FILE_DATA, INPUT_CLEAR, INPUT_SET_PARSING } from '../../constants/ActionTypes';

const initial = {
    loaded: false,
    list: [],
    errors: [],
    total: 0,
    unique: 0,
    name: '',
    size: 0,
    hasProtocols: false,
    sourceType: 'file', // 'file' | 'drag_drop' | 'clipboard' | 'extension'
    lineCount: 0,
    isParsing: false,
};

const input = (state = initial, action) => {
    switch (action.type) {
        case INPUT_SET_LOADED_FILE_DATA:
            return { ...state, ...action.nextState };
        case INPUT_SET_PARSING:
            return { ...state, isParsing: true, lineCount: action.lineCount };
        case INPUT_CLEAR:
            return initial;
        default:
            return state;
    }
};

export default input;
