context := .
image_name := milestone-burnup
image_tag := latest
image_addr = registry.hengshi.org/$(image_name):$(image_tag)

build:
	docker build -t milestone-burnup:latest $(context)
	docker tag $(image_name):$(image_tag) $(image_addr)

push:
	docker push $(image_addr)

