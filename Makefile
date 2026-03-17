.PHONY: dev docs admin build

dev:
	cargo run

docs:
	pnpm --prefix docs run dev

admin:
	pnpm --prefix admin run dev

build:
	cargo build --release
