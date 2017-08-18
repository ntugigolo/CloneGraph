class ErrorsController < ApplicationController 
    def routing 
        referer = request.env['HTTP_REFERER']
        if !referer.nil? and referer.include? request.host
            Rails.logger.fatal "#{referer} directs to non-existant route: #{request.protocol}#{request.host_with_port}#{request.fullpath}"
        else
            Rails.logger.warn "There was an attempt to access non-existant route: #{request.protocol}#{request.host_with_port}#{request.fullpath}"
        end
        render :text => "404 Not Found", :status => 404, :layout => false 
    end 
end
