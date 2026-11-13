"""Regressões do resumo de agentes e controle seguro de processos do painel."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import painel
import monitor


class Activity(unittest.TestCase):
    def test_rotas_do_git_e_dos_agentes_nao_colidem(self):
        with patch.object(painel.gitinfo, 'activity', return_value={'git': True}), patch.object(painel, 'activity', return_value={'agents': []}):
            self.assertEqual(painel.route_ext(None, 'GET', ['activity'], {}), {'git': True})
            self.assertEqual(painel.route_ext(None, 'GET', ['agent-activity'], {}), {'agents': []})

    def snapshot(self, runs, external=None):
        with patch.object(painel, 'RUNS', runs), patch.object(painel, 'PIPES', {}), patch.object(painel, 'live', return_value=external or {'session': None, 'agents': []}):
            return painel.activity()

    def test_prompt_origem_e_controle_sem_rastro(self):
        r = painel.Run('r1', 'garcom-revisor')
        r.status, r.source = 'rodando', 'orquestrar'
        r.proc = Mock()
        r.proc.poll.return_value = None
        r.events = [{'k': 'user', 'text': 'Primeiro'}, {'k': 'user', 'text': 'Atual\n\n[Contexto compartilhado]\nrespostas'}, {'k': 'tool', 'tool': 'Read'}]
        result = self.snapshot({'r1': r})['agents'][0]
        self.assertEqual(result['prompt'], 'Atual')
        self.assertEqual(result['source'], 'orquestrar')
        self.assertTrue(result['controllable'])
        self.assertFalse(result['resumable'])
        self.assertNotIn('events', result)

    def test_parado_com_sessao_pode_retomar_sem_promover_a_processo_ativo(self):
        r = painel.Run('r1', 'garcom-revisor')
        r.status, r.session = 'parado', 'sessao'
        result = self.snapshot({'r1': r})['agents'][0]
        self.assertFalse(result['controllable'])
        self.assertTrue(result['resumable'])

    def test_agente_externo_nao_ganha_controle(self):
        external = {'session': 's1', 'agents': [{'id': 'a1', 'name': 'Revisar', 'type': 'revisor', 'status': 'rodando', 'first': None, 'prompt': 'Revise', 'triggered_by': 'Não registrado'}]}
        result = self.snapshot({}, external)['agents'][0]
        self.assertEqual(result['triggered_by'], 'Não registrado')
        self.assertFalse(result['controllable'])
        self.assertFalse(result['resumable'])

    def test_falha_externa_preserva_agentes_do_painel(self):
        r = painel.Run('r1', 'garcom-revisor')
        with patch.object(painel, 'RUNS', {'r1': r}), patch.object(painel, 'PIPES', {}), patch.object(painel, 'live', side_effect=OSError('indisponível')):
            result = painel.activity()
        self.assertEqual(len(result['agents']), 1)
        self.assertTrue(result['external_error'])

    def test_timer_de_parada_nao_mata_uma_nova_execucao(self):
        r = painel.Run('r1', 'garcom-revisor')
        r.status = 'rodando'
        first, second = Mock(), Mock()
        first.poll.return_value = None
        first.pid = 123
        second.pid = 456
        r.proc = first
        with patch.object(painel.os, 'killpg', create=True) as kill, patch.object(painel.signal, 'SIGKILL', 9, create=True), patch.object(painel.threading, 'Timer') as timer:
            r.stop()
            callback = timer.call_args.args[1]
            r.proc = second
            callback()
            self.assertTrue(kill.called)
            self.assertTrue(all(c.args[0] == 123 for c in kill.call_args_list))


class MonitorPrompt(unittest.TestCase):
    def test_prompt_incremental_ignora_resultado_de_ferramenta(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'session.jsonl'
            path.write_text(json.dumps({'type': 'user', 'message': {'content': 'Tarefa inicial'}}) + '\n', encoding='utf-8')
            tail = monitor.Tail(path)
            tail.pump()
            with path.open('a', encoding='utf-8') as f:
                f.write(json.dumps({'type': 'user', 'message': {'content': [{'type': 'tool_result', 'content': 'conteúdo lido'}]}}) + '\n')
            tail.pump()
            self.assertEqual(tail.prompt, 'Tarefa inicial')
            with path.open('a', encoding='utf-8') as f:
                f.write(json.dumps({'type': 'user', 'message': {'content': [{'type': 'text', 'text': 'Nova tarefa'}]}}) + '\n')
            tail.pump()
            self.assertEqual(tail.prompt, 'Nova tarefa')


if __name__ == '__main__':
    unittest.main()
