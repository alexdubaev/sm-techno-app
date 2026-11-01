"""Repair a Cherri 2.3 unsigned stock shortcut graph; no signing or network access.

The baseline is the offline --skip-sign compilation of sm-techno-stock.cherri.
Native field encodings follow the creator-export examples in the task ruling.
"""
from pathlib import Path
import plistlib
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/shortcuts/sources/cherri-2.3-unsigned-baseline.plist'
OUTPUT = ROOT / 'assets/shortcuts/EXPERIMENTAL-NOT-INSTALLABLE.plist'


def field(action, container, key):
    items = action['WFWorkflowActionParameters'][container]['Value']['WFDictionaryFieldValueItems']
    matches = [x for x in items if x['WFKey']['Value']['string'] == key]
    if len(matches) != 1:
        raise ValueError(f'Expected exactly one {container}.{key}')
    return matches[0]


def typed(item, item_type, state, output_name):
    old = item['WFValue']
    assert old['WFSerializationType'] == 'WFTextTokenString'
    value = old['Value']
    assert value['string'] == '\ufffc' and set(value['attachmentsByRange']) == {'{0, 1}'}
    attachment = value['attachmentsByRange']['{0, 1}']
    assert attachment['Type'] == 'ActionOutput' and attachment['OutputName'] == output_name
    item['WFItemType'] = item_type
    item['WFValue'] = {'WFSerializationType': state, 'Value': {
        'WFSerializationType': 'WFTextTokenAttachment', 'Value': attachment}}


def build():
    with BASE.open('rb') as f:
        graph = plistlib.load(f)
    # Advertise the file/image input as a Share Sheet action extension.
    assert graph.get('WFWorkflowTypes', []) in ([], ['ActionExtension'])
    graph['WFWorkflowTypes'] = ['ActionExtension']
    actions = graph['WFWorkflowActions']
    requests = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl']
    assert len(requests) == 2
    typed(field(requests[0], 'WFFormValues', 'file'), 5, 'WFTokenAttachmentParameterState', 'file')
    typed(field(requests[1], 'WFJSONValues', 'rows'), 2, 'WFArraySubstitutableParameterState', 'rows')
    question, = graph['WFWorkflowImportQuestions']
    assert question['ParameterKey'] == 'WFTextActionText' and question['DefaultValue'] == ''
    assert actions[0]['WFWorkflowActionIdentifier'] == 'is.workflow.actions.gettext'
    assert actions[0]['WFWorkflowActionParameters']['WFTextActionText'] == ''
    question['ActionIndex'] = 0
    # Get all keys first: successful API responses do not contain "detail".
    # Join the keys with newlines, match the complete key, then test whether
    # the match exists. This avoids a list-typed If with a missing operand.
    for target in ('intakeDetail', 'resultDetail'):
        index = next(i for i, a in enumerate(actions)
                     if a.get('WFWorkflowActionParameters', {}).get('CustomOutputName') == target)
        detail = actions[index]['WFWorkflowActionParameters']
        keys_name = target + 'Keys'
        keys_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'sm-techno-stock-' + keys_name))
        keys = {'WFWorkflowActionIdentifier': 'is.workflow.actions.getvalueforkey',
                'WFWorkflowActionParameters': {'CustomOutputName': keys_name, 'UUID': keys_uuid,
                    'WFGetDictionaryValueType': 'All Keys', 'WFInput': detail['WFInput']}}
        reference = {'Value': {'OutputName': keys_name, 'OutputUUID': keys_uuid, 'Type': 'ActionOutput'},
                     'WFSerializationType': 'WFTextTokenAttachment'}
        combined_name = target + 'KeysText'
        combined_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'sm-techno-stock-' + combined_name))
        combine = {'WFWorkflowActionIdentifier': 'is.workflow.actions.text.combine',
                   'WFWorkflowActionParameters': {'CustomOutputName': combined_name, 'UUID': combined_uuid,
                       'WFTextSeparator': 'New Lines', 'text': reference}}
        match_name = target + 'KeyMatch'
        match_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'sm-techno-stock-' + match_name))
        combined_output = {'OutputName': combined_name, 'OutputUUID': combined_uuid, 'Type': 'ActionOutput'}
        match = {'WFWorkflowActionIdentifier': 'is.workflow.actions.text.match',
                 'WFWorkflowActionParameters': {'CustomOutputName': match_name, 'UUID': match_uuid,
                     'WFMatchTextPattern': r'(?m)^detail$', 'WFMatchTextCaseSensitive': True,
                     'text': {'Value': {'string': '\ufffc', 'attachmentsByRange': {'{0, 1}': combined_output}},
                              'WFSerializationType': 'WFTextTokenString'}}}
        match_reference = {'Value': {'OutputName': match_name, 'OutputUUID': match_uuid, 'Type': 'ActionOutput'},
                           'WFSerializationType': 'WFTextTokenAttachment'}
        start = {'WFWorkflowActionIdentifier': 'is.workflow.actions.conditional',
                 'WFWorkflowActionParameters': {'WFControlFlowMode': 0, 'WFCondition': 100,
                     'WFInput': {'Type': 'Variable', 'Variable': match_reference}}}
        end = {'WFWorkflowActionIdentifier': 'is.workflow.actions.conditional',
               'WFWorkflowActionParameters': {'WFControlFlowMode': 2, 'UUID': 'placeholder'}}
        # The existing detail/alert/exit conditional occupies six actions.
        assert actions[index + 1]['WFWorkflowActionParameters']['WFControlFlowMode'] == 0
        assert actions[index + 5]['WFWorkflowActionParameters']['WFControlFlowMode'] == 2
        actions[index:index] = [keys, combine, match, start]
        actions.insert(index + 10, end)
    # Cherri 2.3 reused one identifier for unrelated control-flow blocks. Replace
    # it consistently within each properly nested block; end UUID denotes its output.
    stack = []
    control = {'is.workflow.actions.conditional', 'is.workflow.actions.choosefrommenu',
               'is.workflow.actions.repeat.count', 'is.workflow.actions.repeat.each'}
    for index, action in enumerate(actions):
        if action['WFWorkflowActionIdentifier'] not in control:
            continue
        params = action['WFWorkflowActionParameters']
        mode = params['WFControlFlowMode']
        if mode == 0:
            group = str(uuid.uuid5(uuid.NAMESPACE_URL, f'sm-techno-stock-control-{index}'))
            stack.append((action['WFWorkflowActionIdentifier'], group))
        if not stack or stack[-1][0] != action['WFWorkflowActionIdentifier']:
            raise ValueError(f'Unbalanced control action at {index}')
        params['GroupingIdentifier'] = stack[-1][1]
        if mode == 2:
            if 'UUID' in params:
                params['UUID'] = stack[-1][1]
            stack.pop()
        elif mode not in (0, 1):
            raise ValueError(f'Unexpected control mode {mode}')
    if stack:
        raise ValueError('Unclosed control action')
    return graph


if __name__ == '__main__':
    with OUTPUT.open('wb') as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_XML, sort_keys=False)
    print(f'Wrote unsigned, not installable: {OUTPUT}')
