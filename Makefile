deploy:
	rsync -avz --progress build/ -e ssh www.wikdict.com:hosts/litespread

pretty:
	./node_modules/.bin/prettier --single-quote --write "src/**/*.{js,jsx,json,css}"

clean:
	rm -fr package-lock.json node_modules/* && touch node_modules/CACHEDIR.TAG
