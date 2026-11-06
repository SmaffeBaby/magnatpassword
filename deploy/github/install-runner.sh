#!/bin/bash
set -euo pipefail
umask 077

[[ $EUID == 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
magnat_source=/home/magnat/migration/github
magnat_runner=/opt/magnat-runner
magnat_state=/var/lib/magnat-deploy

if [[ -e $magnat_runner/.runner ]]; then
  echo 'Runner already configured; refusing to overwrite its registration.' >&2
  exit 1
fi
install -d -o root -g root -m 700 "$magnat_state"
install -o root -g root -m 755 "$magnat_source/deploy.py" /usr/local/sbin/magnat-deploy
if ! id magnat-ci >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir "$magnat_runner" --shell /usr/sbin/nologin magnat-ci
fi
install -d -o magnat-ci -g magnat-ci -m 700 "$magnat_runner"
# No docker or sudo group membership. The only privileged command verifies main itself.
printf 'magnat-ci ALL=(root) NOPASSWD: /usr/local/sbin/magnat-deploy\n' > /etc/sudoers.d/magnat-deploy
chmod 440 /etc/sudoers.d/magnat-deploy
visudo -cf /etc/sudoers.d/magnat-deploy

curl --fail --silent --show-error --location --retry 3 \
  https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-x64-2.338.2.tar.gz \
  --output "$magnat_state/runner.tar.gz"
printf 'baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40  %s\n' "$magnat_state/runner.tar.gz" | sha256sum -c -
sudo -u magnat-ci tar xzf - -C "$magnat_runner" < "$magnat_state/runner.tar.gz"
"$magnat_runner/bin/installdependencies.sh"
magnat_registration_token=$(cat "$magnat_source/registration.token")
cd "$magnat_runner"
sudo -u magnat-ci ./config.sh --unattended \
  --url https://github.com/SmaffeBaby/magnatpassword \
  --token "$magnat_registration_token" \
  --name magnat-production --labels magnat-production --work _work
unset magnat_registration_token
./svc.sh install magnat-ci
magnat_service=$(cat .service)
[[ $magnat_service == actions.runner.SmaffeBaby-magnatpassword.magnat-production.service ]] || {
  echo 'Unexpected runner service name.' >&2; exit 1;
}
install -d -m 755 "/etc/systemd/system/$magnat_service.d"
cat > "/etc/systemd/system/$magnat_service.d/isolation.conf" <<'UNIT'
[Service]
UMask=0077
PrivateTmp=true
# Worker processes inherit the network policy. Private office networks and host
# services cannot be contacted; the local DNS stub is the sole loopback exception.
IPAddressDeny=127.0.0.0/8
IPAddressDeny=10.0.0.0/8
IPAddressDeny=172.16.0.0/12
IPAddressDeny=192.168.0.0/16
IPAddressDeny=169.254.0.0/16
IPAddressDeny=::1/128
IPAddressDeny=fc00::/7
IPAddressDeny=fe80::/10
IPAddressAllow=127.0.0.53/32
UNIT
systemctl daemon-reload
./svc.sh start
./svc.sh status
echo 'Dedicated production runner installed. No inbound ports or production secrets were added to GitHub.'
