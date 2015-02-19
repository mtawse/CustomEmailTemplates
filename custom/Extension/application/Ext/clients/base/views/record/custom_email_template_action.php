<?php
/**
 * @author Martin Tawse martin.tawse@thesugarrefinery.com
 * @copyright The Sugar Refinery
 *
 * Add "Custom Email Template" action to all modules
 * Only works for modules that don't have customised buttons
 */


require_once 'clients/base/views/record/record.php';


$email_template_action = array(
    'type' => 'custom-email-template',
    'name' => 'custom-email-template',
    'label' => 'LBL_CUSTOM_EMAIL_TEMPLATE',
    'acl_action' => 'view',
);


foreach($viewdefs['base']['view']['record']['buttons'] as &$set){
    if( $set['type'] == 'actiondropdown' && $set['name'] == 'main_dropdown'){
        // insert before delete
        $position = count($set['buttons']) - 2;
        $GLOBALS['log']->fatal("position: $position");
        $GLOBALS['log']->fatal(print_r($email_template_action, true));
//        array_splice($set['buttons'], $position, 0, array($email_template_action));
//       $GLOBALS['log']->fatal(print_r($set, true));
//        $set['buttons'][] = $email_template_action;
    }
}
