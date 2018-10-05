deploy:
	rsync -avz --progress build/ -e ssh www.wikdict.com:hosts/litespread

pretty:
	./node_modules/.bin/prettier --single-quote --write "src/**/*.{js,jsx,json,css}"
