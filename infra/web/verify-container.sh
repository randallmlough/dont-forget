#!/bin/sh

set -eu

image=${1:-dont-forget-web:t5}
browser_image=${2:-selenium/standalone-chromium:4.44.0-20260505}
container="dont-forget-web-t5-$$"
browser_container="dont-forget-web-browser-t5-$$"
network="dont-forget-web-t5-$$"
response_directory=$(mktemp -d)

cleanup() {
	docker rm -f "$container" >/dev/null 2>&1 || true
	docker rm -f "$browser_container" >/dev/null 2>&1 || true
	docker network rm "$network" >/dev/null 2>&1 || true
	rm -rf "$response_directory"
}
trap cleanup EXIT INT TERM

docker network create "$network" >/dev/null
docker run --detach --name "$container" --network "$network" --publish 127.0.0.1::8080 "$image" >/dev/null

host_port=
attempt=0
while [ "$attempt" -lt 40 ]; do
	port_output=$(docker port "$container" 8080/tcp 2>/dev/null || true)
	host_port=${port_output##*:}
	if [ -n "$host_port" ] && curl --silent --fail "http://127.0.0.1:$host_port/.well-known/apple-app-site-association" >/dev/null 2>&1; then
		break
	fi
	attempt=$((attempt + 1))
	sleep 1
done

if [ -z "$host_port" ] || [ "$attempt" -eq 40 ]; then
	echo "Web container did not become ready" >&2
	exit 1
fi

request() {
	name=$1
	path=$2
	expected_status=$3
	status=$(curl \
		--silent \
		--show-error \
		--max-redirs 0 \
		--dump-header "$response_directory/$name.headers" \
		--output "$response_directory/$name.body" \
		--write-out '%{http_code}' \
		"http://127.0.0.1:$host_port$path")
	if [ "$status" != "$expected_status" ]; then
		echo "$path returned $status; expected $expected_status" >&2
		exit 1
	fi
	if grep -Eiq '^location:' "$response_directory/$name.headers"; then
		echo "$path unexpectedly redirected" >&2
		exit 1
	fi
}

request aasa '/.well-known/apple-app-site-association' 200
grep -Eiq '^content-type: application/json\r?$' "$response_directory/aasa.headers"

request invitation '/invitations/accept?token=t5-token-marker' 200
request household '/households/join?code=t5-code-marker' 200
for name in invitation household; do
	grep -Eiq '^content-type: text/html\r?$' "$response_directory/$name.headers"
	grep -Eiq '^cache-control: no-store\r?$' "$response_directory/$name.headers"
	grep -Eiq '^referrer-policy: no-referrer\r?$' "$response_directory/$name.headers"
	grep -aq 'Open in <!-- -->Don&#x27;t Forget' "$response_directory/$name.body"
done

asset_path=$(grep -aEo '/assets/[^" ]+' "$response_directory/invitation.body" | head -1)
if [ -z "$asset_path" ]; then
	echo "Invitation page did not reference a generated static asset" >&2
	exit 1
fi
request asset "$asset_path" 200

request unknown '/not-found' 404
request root '/' 404
request api '/api/bootstrap' 404
for name in unknown root api; do
	grep -Eiq '^content-type: text/plain\r?$' "$response_directory/$name.headers"
done

docker run \
	--detach \
	--name "$browser_container" \
	--network "$network" \
	--publish 127.0.0.1::4444 \
	--shm-size 2g \
	"$browser_image" >/dev/null

webdriver_port=
attempt=0
while [ "$attempt" -lt 60 ]; do
	port_output=$(docker port "$browser_container" 4444/tcp 2>/dev/null || true)
	webdriver_port=${port_output##*:}
	if [ -n "$webdriver_port" ] && curl --silent --fail "http://127.0.0.1:$webdriver_port/status" >/dev/null 2>&1; then
		break
	fi
	attempt=$((attempt + 1))
	sleep 1
done

if [ -z "$webdriver_port" ] || [ "$attempt" -eq 60 ]; then
	echo "Browser container did not become ready" >&2
	exit 1
fi

node infra/web/verify-hydration.mjs \
	"http://127.0.0.1:$webdriver_port" \
	"http://$container:8080" \
	"dontforget-test"

logs=$(docker logs "$container" 2>&1)
if printf '%s' "$logs" | grep -Eq 't5-token-marker|t5-code-marker'; then
	echo "Sensitive query marker appeared in container logs" >&2
	exit 1
fi

echo "Web container response policy verified"
