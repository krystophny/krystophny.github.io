#!/bin/sh
# Assemble one page from a body fragment, the shared header and the footer.
#
#     build.sh <fragment> <base-url-prefix> <cache-buster>
#
# The output path follows the fragment path, so pages/research.html becomes
# public/research/index.html and the public URL stays /research/.  A fragment
# named index.html inside a directory keeps that directory as its URL.
#
# The page title is the text of the fragment's first <h1>, so a page carries
# its title exactly once instead of repeating it in front matter.
set -eu

src=$1
base=$2
ver=$3

rel=${src#pages/}
case $rel in
    index.html)   dst=public/index.html ;;
    404.html)     dst=public/404.html ;;
    */index.html) dst=public/$rel ;;
    *)            dst=public/${rel%.html}/index.html ;;
esac

title=$(sed -n 's|.*<h1>\(.*\)</h1>.*|\1|p' "$src" | head -n 1)

mkdir -p "$(dirname "$dst")"
cat parts/head.html "$src" parts/foot.html |
    sed -e "s|{{TITLE}}|$title|g" -e "s|{{BASE}}|$base|g" -e "s|{{V}}|$ver|g" \
    > "$dst"
echo "$dst"
