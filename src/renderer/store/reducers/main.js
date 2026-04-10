import { initial } from '../../core/settings';
import { MAIN_SET_STATS } from '../../constants/ActionTypes';

const main = (state = initial.main, action) => {
    switch (action.type) {
        case MAIN_SET_STATS:
            return {
                ...state,
                stats: action.stats
            };
        default:
            return state;
    }
};

export default main;
