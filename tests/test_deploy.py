import importlib.util
from pathlib import Path
import tempfile
import unittest
import hashlib

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).parents[1] / 'deploy/github/deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentPlanTests(unittest.TestCase):
    def test_web_change_keeps_database_services_running(self):
        self.assertEqual(deploy.plan(['app/pages/index.vue']),
                         {'web': True, 'stack': False, 'proxy': False, 'restart': []})

    def test_native_and_documentation_changes_do_not_rebuild_web(self):
        self.assertEqual(deploy.plan(['README.md', 'src-tauri/src/native_notifications.rs',
                                     'scripts/android.mjs', '.github/workflows/deploy.yml']),
                         {'web': False, 'stack': False, 'proxy': False, 'restart': []})

    def test_configuration_and_gateway_changes_select_required_services(self):
        self.assertTrue(deploy.plan(['docker-compose.server.yml'])['stack'])
        self.assertEqual(deploy.plan(['supabase/volumes/api/kong.yml'])['restart'], ['api-gw'])
        self.assertTrue(deploy.plan(['deploy/windows-server/Caddyfile'])['proxy'])
        self.assertTrue(deploy.plan(['scripts/finance-report.py'])['web'])

    def test_changed_or_deleted_applied_migration_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = root / '001_test.sql'
            first.write_text('select 1;')
            applied = {first.name: hashlib.sha256(first.read_bytes()).hexdigest()}
            (root / '002_next.sql').write_text('select 2;')
            self.assertEqual(deploy.validate_migrations(applied, root), ['002_next.sql'])
            first.write_text('select 3;')
            with self.assertRaises(RuntimeError):
                deploy.validate_migrations(applied, root)
            first.unlink()
            with self.assertRaises(RuntimeError):
                deploy.validate_migrations(applied, root)

    def test_runner_environment_cannot_control_git_or_docker(self):
        self.assertNotIn('DOCKER_HOST', deploy.ENV)
        self.assertNotIn('PYTHONPATH', deploy.ENV)
        self.assertEqual(deploy.ENV['GIT_CONFIG_GLOBAL'], '/dev/null')
        self.assertIn('supabase/.env', deploy.EXCLUDES)
        self.assertIn('supabase/volumes/storage/', deploy.EXCLUDES)


if __name__ == '__main__':
    unittest.main()
