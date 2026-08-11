# Plain HTML site.  No site generator, no CSS framework, no JavaScript
# framework: make, sh and sed do the whole build.
#
#     make          build into public/
#     make serve    build and serve it on localhost
#
# GitHub Pages publishes public/ from the workflow in .github/workflows, so
# nothing generated is committed to the repository.

BASE ?=
PORT ?= 8000

# Stamped into the asset URLs.  Without it a browser keeps an old stylesheet
# or an old renderer and a deployed change looks like it never shipped.
V := $(shell date +%Y%m%d%H%M%S)

PAGES := $(shell find pages -name '*.html')

.PHONY: all clean serve

all: clean
	@mkdir -p public
	@cp -R static/. public/
	@for f in $(PAGES); do sh build.sh "$$f" "$(BASE)" "$(V)"; done

clean:
	@rm -rf public

serve: all
	@echo "serving on http://localhost:$(PORT)/"
	@cd public && python3 -m http.server $(PORT)
