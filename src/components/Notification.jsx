import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { openLink } from '../misc/other';
import '../../public/styles/Notification.postcss';
import Logo from '../../public/icons/Logo-ProxyScrape-colored.png';
import CloseIcon from './ui/CloseIcon';

const Notification = ({ show, toggleNotify, fileName, checkProxy, disable }) => {
    return (
        <div className={`modal-notification-wrap ${show && 'active'}`} onClick={toggleNotify}>
            <CloseIcon onChange={toggleNotify}/>
            <div className='modal-header'>
                <img src={Logo} width="120" height="15.25"/>
            </div>
            <div className="modal-content">
                New proxy list "{fileName}" detected.
            </div>
            <div className="modal-footer">
                <button className='button check-button' data-file={fileName} onClick={ checkProxy }>
                    Check
                </button>
                <div className='disable-check' onClick={disable}>__Disable notifications__</div>  
            </div>
        </div>
    );
};

export default Notification;
