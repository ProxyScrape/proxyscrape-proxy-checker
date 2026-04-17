import { CHECKING_UP_COUNTER_STATUS, CHECKING_OPEN, CHECKING_OTHER_CHANGES } from '../../constants/ActionTypes';

const initialState = {
    opened: false,
    starting: false, // true from the moment Start is clicked until the checker overlay opens or the attempt fails
    preparing: false,
    // Set while the backend is calling the geo worker after the check finishes.
    // The overlay stays open until results are shown.
    finalizingMessage: null,  // string — shown with spinner in the overlay
    counter: {
        all: 0,
        done: 0,
        protocols: {
            /**
             * http: 0,
             * https: 0,
             * socks4: 0,
             * socks5: 0
             */
        }
    }
};

const checking = (state = initialState, action) => {
    switch (action.type) {
        case CHECKING_UP_COUNTER_STATUS:
            return {
                ...state,
                counter: action.counter
            };
        case CHECKING_OPEN:
            return {
                ...state,
                opened: true,
                starting: false,
                preparing: false,
                counter: action.counter
            };
        case CHECKING_OTHER_CHANGES:
            return {
                ...state,
                ...action.state
            };
        default:
            return state;
    }
};

export default checking;
