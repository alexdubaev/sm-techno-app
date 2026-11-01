import importlib.util
import plistlib
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / 'assets/shortcuts/EXPERIMENTAL-NOT-INSTALLABLE.plist'


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def fields(params, key):
    return {v['WFKey']['Value']['string']: v for v in params[key]['Value']['WFDictionaryFieldValueItems']}


class ShortcutArtifact(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph = plistlib.loads(PATH.read_bytes())
        cls.actions = cls.graph['WFWorkflowActions']
        cls.params = [a.get('WFWorkflowActionParameters', {}) for a in cls.actions]
        cls.names = [a['WFWorkflowActionIdentifier'].split('.')[-1] for a in cls.actions]
        cls.outputs = {p['CustomOutputName']: (i, p) for i, p in enumerate(cls.params) if 'CustomOutputName' in p}

    def test_reproducible_and_single_blank_import(self):
        spec = importlib.util.spec_from_file_location('builder', ROOT / 'scripts/build_stock_shortcut.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(self.graph, module.build())
        q, = self.graph['WFWorkflowImportQuestions']
        self.assertEqual((q['ActionIndex'], q['ParameterKey'], q['DefaultValue']), (0, 'WFTextActionText', ''))
        self.assertEqual(self.params[0]['WFTextActionText'], '')
        self.assertEqual(self.graph['WFWorkflowInputContentItemClasses'], ['WFGenericFileContentItem', 'WFImageContentItem'])
        self.assertEqual(self.graph['WFWorkflowTypes'], ['ActionExtension'])
        self.assertEqual(q['Text'], 'Вставьте строку подключения из настроек')
        self.assertEqual(len(self.actions), 115)

    def test_all_output_refs_point_backwards_and_control_groups_match(self):
        seen, stack, groups = {}, [], set()
        for i, (name, p) in enumerate(zip(self.names, self.params)):
            for node in walk(p):
                if node.get('Type') == 'ActionOutput':
                    self.assertIn(node['OutputUUID'], seen, (i, node))
                    self.assertLess(seen[node['OutputUUID']], i)
            if name in ('conditional', 'choosefrommenu'):
                mode, group = p['WFControlFlowMode'], p['GroupingIdentifier']
                if mode == 0:
                    self.assertNotIn(group, groups)
                    groups.add(group)
                    stack.append((name, group))
                else:
                    self.assertTrue(stack)
                    self.assertEqual(stack[-1], (name, group))
                    if mode == 2:
                        self.assertEqual(p['UUID'], group)
                        stack.pop()
            if 'UUID' in p:
                self.assertNotIn(p['UUID'], seen)
                seen[p['UUID']] = i
        self.assertFalse(stack)

    def test_requests_use_typed_references_and_only_configured_server(self):
        requests = [(i, p) for i, (n, p) in enumerate(zip(self.names, self.params)) if n == 'downloadurl']
        self.assertEqual(len(requests), 2)
        for (i, p), suffix, kind in zip(requests, ('intake', 'resolve'), ('Form', 'JSON')):
            self.assertEqual((p['WFHTTPMethod'], p['WFHTTPBodyType']), ('POST', kind))
            url = p['WFURL']['Value']
            self.assertEqual(url['string'], '\ufffc/api/shortcuts/stock/' + suffix)
            self.assertEqual(url['attachmentsByRange']['{0, 1}']['OutputUUID'], self.outputs['base'][1]['UUID'])
            header = fields(p, 'WFHTTPHeaders')
            self.assertEqual(set(header), {'Authorization'})
            val = header['Authorization']['WFValue']['Value']
            self.assertEqual(val['string'], 'Shortcut \ufffc')
            self.assertEqual(val['attachmentsByRange']['{9, 1}']['OutputUUID'], self.outputs['credential'][1]['UUID'])
        form = fields(requests[0][1], 'WFFormValues')
        body = fields(requests[1][1], 'WFJSONValues')
        self.assertEqual(set(form), {'file'})
        self.assertEqual(set(body), {'rows', 'format'})
        fmt = body['format']['WFValue']['Value']
        self.assertEqual(fmt['string'], '\ufffc')
        self.assertEqual(fmt['attachmentsByRange']['{0, 1}'], {'Type': 'Variable', 'VariableName': 'format'})
        for entry, typ, state, target in ((form['file'], 5, 'WFTokenAttachmentParameterState', 'file'), (body['rows'], 2, 'WFArraySubstitutableParameterState', 'rows')):
            self.assertEqual(entry['WFItemType'], typ)
            outer = entry['WFValue']
            self.assertEqual(outer['WFSerializationType'], state)
            inner = outer['Value']
            self.assertEqual(inner['WFSerializationType'], 'WFTextTokenAttachment')
            self.assertEqual(inner['Value']['OutputUUID'], self.outputs[target][1]['UUID'])

    def test_guards_preview_cancel_and_output_path(self):
        self.assertEqual(self.params[self.outputs['configMatch'][0]]['WFMatchTextPattern'], r'^SMTECHNO1\.[A-Za-z0-9+/]+={0,2}$')
        self.assertEqual(self.params[self.outputs['urlMatch'][0]]['WFMatchTextPattern'], r'^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$')
        self.assertEqual(self.params[self.outputs['keyMatch'][0]]['WFMatchTextPattern'], r'^[A-Za-z0-9_-]{43}$')
        for target in ('configMatch', 'urlMatch', 'keyMatch', 'n', 'rows', 'workbookRaw', 'data'):
            ident = self.outputs[target][1]['UUID']
            guards = [i for i, p in enumerate(self.params) if self.names[i] == 'conditional' and p.get('WFControlFlowMode') == 0 and any(n.get('OutputUUID') == ident for n in walk(p))]
            self.assertEqual(len(guards), 1, target)
            i = guards[0]
            self.assertEqual(self.params[i]['WFCondition'], 5 if target == 'n' else 101)
            if target == 'n': self.assertEqual(self.params[i]['WFNumberValue'], 1)
            self.assertEqual(self.names[i+1:i+3], ['alert', 'exit'])
        menu = next(i for i, p in enumerate(self.params) if self.names[i] == 'choosefrommenu' and p['WFControlFlowMode'] == 0)
        self.assertLess(self.outputs['preview'][0], menu)
        self.assertIn('Предупреждения', str(self.params[menu-3]))
        cancel = next(i for i, p in enumerate(self.params) if p.get('WFMenuItemTitle') == 'Отмена')
        self.assertEqual(self.names[cancel+1], 'exit')
        self.assertEqual(self.params[self.outputs['Text 2'][0]]['WFTextActionText'], 'valuation')
        self.assertEqual(self.params[self.outputs['Text 3'][0]]['WFTextActionText'], 'offer')
        self.assertEqual(self.names[-3:], ['base64encode', 'setitemname', 'previewdocument'])
        self.assertNotIn('share', self.names)
        self.assertEqual(self.params[-3]['WFEncodeMode'], 'Decode')
        self.assertEqual(self.params[-2]['WFName']['Value']['attachmentsByRange']['{0, 1}']['OutputUUID'], self.outputs['filename'][1]['UUID'])

    def test_server_details_stop_and_warnings_are_conditional(self):
        for target, dictionary, before in (('intakeDetail', 'intakeDict', 'rows'), ('resultDetail', 'resultDict', 'workbookRaw')):
            i, p = self.outputs[target]
            key_index, keys = self.outputs[target + 'Keys']
            self.assertEqual(self.names[key_index], 'getvalueforkey')
            self.assertEqual(keys['WFGetDictionaryValueType'], 'All Keys')
            self.assertNotIn('WFDictionaryKey', keys)
            self.assertEqual(keys['WFInput']['Value']['OutputUUID'], self.outputs[dictionary][1]['UUID'])
            combine = self.params[key_index + 1]
            self.assertEqual(self.actions[key_index + 1]['WFWorkflowActionIdentifier'], 'is.workflow.actions.text.combine')
            self.assertEqual(combine['WFTextSeparator'], 'New Lines')
            self.assertEqual(combine['text']['WFSerializationType'], 'WFTextTokenAttachment')
            self.assertEqual(combine['text']['Value']['OutputUUID'], keys['UUID'])
            match = self.params[key_index + 2]
            self.assertEqual(self.actions[key_index + 2]['WFWorkflowActionIdentifier'], 'is.workflow.actions.text.match')
            self.assertTrue(match['WFMatchTextCaseSensitive'])
            self.assertEqual(match['text']['WFSerializationType'], 'WFTextTokenString')
            self.assertEqual(match['text']['Value']['attachmentsByRange']['{0, 1}']['OutputUUID'], combine['UUID'])
            pattern = match['WFMatchTextPattern']
            self.assertEqual(pattern, r'(?m)^detail$')
            for keys_list, expected in ((['rows', 'detail', 'warnings'], True), (['detail'], True),
                                        (['detailCount', 'details', 'Detail'], False), ([], False)):
                self.assertEqual(bool(re.search(pattern, '\n'.join(keys_list))), expected)
            outer = self.params[key_index + 3]
            self.assertEqual((self.names[key_index + 3], outer['WFControlFlowMode'], outer['WFCondition']), ('conditional', 0, 100))
            self.assertNotIn('WFConditionalActionString', outer)
            self.assertEqual(outer['WFInput']['Variable']['Value']['OutputUUID'], match['UUID'])
            self.assertEqual(i, key_index + 4)
            self.assertEqual((self.names[i + 6], self.params[i + 6]['WFControlFlowMode']), ('conditional', 2))
            self.assertEqual(self.params[i + 6]['GroupingIdentifier'], outer['GroupingIdentifier'])
            self.assertEqual(p['WFDictionaryKey'], 'detail')
            self.assertEqual(p['WFInput']['Value']['OutputUUID'], self.outputs[dictionary][1]['UUID'])
            self.assertLess(i, self.outputs[before][0])
            guard = self.params[i + 1]
            self.assertEqual((self.names[i+1], guard['WFControlFlowMode'], guard['WFCondition']), ('conditional', 0, 100))
            self.assertEqual(guard['WFInput']['Variable']['Value']['OutputUUID'], p['UUID'])
            self.assertEqual(self.names[i+2:i+4], ['alert', 'exit'])
            self.assertEqual(self.params[i+2]['WFAlertActionMessage']['Value']['attachmentsByRange']['{0, 1}']['OutputUUID'], p['UUID'])
        i, p = self.outputs['warning2']
        guard = self.params[i+1]
        self.assertEqual((self.names[i+1], guard['WFControlFlowMode'], guard['WFCondition']), ('conditional', 0, 100))
        self.assertEqual(guard['WFInput']['Variable']['Value']['OutputUUID'], p['UUID'])
        self.assertEqual(self.names[i+2], 'alert')
        self.assertEqual(self.params[i+2]['WFAlertActionMessage']['Value']['attachmentsByRange']['{0, 1}']['OutputUUID'], p['UUID'])


if __name__ == '__main__':
    unittest.main()
