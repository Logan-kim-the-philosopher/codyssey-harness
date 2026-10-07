import assert from 'node:assert/strict';
import test from 'node:test';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { findGrammarHelp } from '../src/grammar-reference.mjs';

function findNode(node, name) {
  if (node.name === name) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

test('grammar help resolves parsed JavaScript, HTML, and CSS syntax nodes', () => {
  const samples = [
    ['javascript', javascriptLanguage.parser, 'const load = async () => await fetch("/");', ['const', 'async', 'await', 'CallExpression']],
    ['html', htmlLanguage.parser, '<label for="name">Name</label>', ['StartTag', 'TagName', 'AttributeName', 'AttributeValue']],
    ['css', cssLanguage.parser, '.hero { color: red; }', ['RuleSet', 'ClassName', 'PropertyName', 'ValueName']],
  ];

  for (const [language, parser, source, expectedNames] of samples) {
    const tree = parser.parse(source);
    for (const name of expectedNames) {
      const node = findNode(tree.topNode, name);
      assert.ok(node, `${language} parser should produce ${name}`);
      assert.ok(findGrammarHelp(language, node), `${language}.${name} should have a tooltip explanation`);
    }
  }
});
